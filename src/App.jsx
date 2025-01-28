import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import FileUpload from "./components/FileUpload";
import MessageForm from "./components/MessageForm";
import StatusIndicator from "./components/StatusIndicator";
import { API_BASE_URL } from "./config";

// Create a custom axios instance with specific config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000, // 10 minutes
  withCredentials: true,
  maxContentLength: 16 * 1024 * 1024,
  maxBodyLength: 16 * 1024 * 1024,
  headers: {
    'X-Protocol': 'HTTP/1.1',
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=600'
  }
});

// Add request interceptor
api.interceptors.request.use(config => {
  config.headers['X-Requested-With'] = 'XMLHttpRequest';
  config.headers['Cache-Control'] = 'no-cache';
  return config;
});

// Add response interceptor with retry logic
api.interceptors.response.use(
  response => response,
  async error => {
    const { config } = error;
    if (!config || !config.retry) {
      return Promise.reject(error);
    }

    config.retry -= 1;
    if (config.retry === 0) {
      return Promise.reject(error);
    }

    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, 2000));
    return api(config);
  }
);

function App() {
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [message, setMessage] = useState("");
  const [mediaFiles, setMediaFiles] = useState([]);
  const [status, setStatus] = useState("disconnected");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [hasMedia, setHasMedia] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const response = await api.get('/status');
      setStatus(response.data.status);
      setQrCode(response.data.qrCode);
    } catch (error) {
      console.error("Error checking status:", error);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.post('/disconnect');
      toast.success("تم قطع الاتصال بنجاح");
      setResults(null);
      setPhoneNumbers([]);
      setMessage("");
      setMediaFiles([]);
      setHasMedia(false);
    } catch (error) {
      toast.error("حدث خطأ أثناء قطع الاتصال");
    }
  };

  const handleExcelUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const numbers = jsonData
          .map((row) => {
            const phoneKey = Object.keys(row).find(key => 
              key.toLowerCase().includes('phone') || 
              key.includes('هاتف') || 
              key.includes('موبايل') || 
              key.includes('رقم')
            );
            return row[phoneKey];
          })
          .filter(Boolean)
          .map(num => num.toString().replace(/\D/g, ''));

        setPhoneNumbers(numbers);
        toast.success(`تم تحميل ${numbers.length} رقم`);
      } catch (error) {
        toast.error("حدث خطأ في قراءة الملف");
        console.error("Excel parsing error:", error);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleMediaUpload = async (files) => {
    const uploadedFiles = [];
    setIsLoading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append("media", files[i]);

        const response = await api.post('/upload-media', formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          retry: 3,
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(percentCompleted);
          },
        });

        uploadedFiles.push(response.data.filePath);
      }

      setMediaFiles(uploadedFiles);
      setHasMedia(true);
      toast.success("تم رفع الملفات بنجاح");
    } catch (error) {
      toast.error(error.response?.data?.error || "فشل رفع الملفات");
      console.error("Upload error:", error);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  const sendMessages = async () => {
    if (!phoneNumbers.length) {
      toast.error("يرجى إدخال الأرقام أولاً");
      return;
    }

    if (!message && !hasMedia) {
      toast.error("يرجى إدخال رسالة أو اختيار ملف وسائط");
      return;
    }

    setIsLoading(true);

    try {
      // Split numbers into smaller chunks
      const chunkSize = 5;
      const chunks = [];
      for (let i = 0; i < phoneNumbers.length; i += chunkSize) {
        chunks.push(phoneNumbers.slice(i, i + chunkSize));
      }

      const allResults = { success: [], failed: [] };

      // Process each chunk
      for (const chunk of chunks) {
        const payload = {
          numbers: chunk,
          message: message || undefined,
          mediaPaths: mediaFiles,
        };

        try {
          const response = await api.post('/send-bulk-messages', payload, {
            retry: 3,
            timeout: 300000,
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setProgress(percentCompleted);
            },
          });

          allResults.success.push(...response.data.results.success);
          allResults.failed.push(...response.data.results.failed);

          // Add delay between chunks
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          // If chunk fails, add all numbers to failed
          allResults.failed.push(...chunk.map(number => ({
            number,
            reason: "فشل في الإرسال"
          })));
        }
      }

      setResults(allResults);
      
      const successCount = allResults.success.length;
      const failedCount = allResults.failed.length;

      toast.success(
        `تم الإرسال بنجاح إلى ${successCount} رقم، وفشل الإرسال إلى ${failedCount} رقم`
      );
    } catch (error) {
      console.error("Send error:", error);
      toast.error("حدث خطأ في عملية الإرسال. يرجى المحاولة مرة أخرى");
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Toaster position="top-center" />

        <h1 className="text-3xl font-bold text-center text-gray-900">
          برنامج إرسال رسائل واتساب
        </h1>

        <StatusIndicator
          status={status}
          numbers={phoneNumbers}
          results={results}
          qrCode={qrCode}
          onDisconnect={handleDisconnect}
          progress={progress}
        />

        <FileUpload
          onExcelUpload={handleExcelUpload}
          onMediaUpload={handleMediaUpload}
          isLoading={isLoading}
          progress={progress}
        />

        <MessageForm
          message={message}
          setMessage={setMessage}
          onSend={sendMessages}
          isLoading={isLoading}
          hasMedia={hasMedia}
          progress={progress}
        />
      </div>
    </div>
  );
}

export default App;