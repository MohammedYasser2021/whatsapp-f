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
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
});

// Add request interceptor for detailed logging
api.interceptors.request.use(
  config => {
    console.log('Request:', {
      url: config.url,
      method: config.method,
      headers: config.headers,
      data: config.data
    });
    return config;
  },
  error => {
    console.error('Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor with retry logic and detailed logging
api.interceptors.response.use(
  response => {
    console.log('Response:', {
      status: response.status,
      headers: response.headers,
      data: response.data
    });
    return response;
  },
  async error => {
    console.error('Response Error:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers
    });

    const { config, message } = error;
    
    if (!config || !config.retry) {
      return Promise.reject(error);
    }

    // Retry only on network errors or 5xx responses
    if (!error.response || (error.response.status >= 500 && error.response.status <= 599)) {
      config.retry -= 1;
      
      if (config.retry === 0) {
        return Promise.reject(error);
      }

      const backoffDelay = Math.min(1000 * (2 ** (3 - config.retry)), 10000);
      console.log(`Retrying request after ${backoffDelay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return api(config);
    }

    return Promise.reject(error);
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
      const response = await api.get('/status', {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      setStatus(response.data.status);
      setQrCode(response.data.qrCode);
    } catch (error) {
      console.error("Status check error:", error);
      // Don't update status on error to maintain last known good state
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
      console.error("Disconnect error:", error);
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
        console.error("Excel parsing error:", error);
        toast.error("حدث خطأ في قراءة الملف");
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
        await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between uploads
      }

      setMediaFiles(uploadedFiles);
      setHasMedia(true);
      toast.success("تم رفع الملفات بنجاح");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error.response?.data?.error || "فشل رفع الملفات");
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
      // First, verify WhatsApp connection
      const statusResponse = await api.get('/status');
      if (statusResponse.data.status !== 'connected') {
        toast.error("يرجى التأكد من اتصال واتساب أولاً");
        setIsLoading(false);
        return;
      }

      // Process in very small chunks with longer delays
      const chunkSize = 2; // Send only 2 numbers at a time
      const chunks = [];
      for (let i = 0; i < phoneNumbers.length; i += chunkSize) {
        chunks.push(phoneNumbers.slice(i, i + chunkSize));
      }

      const allResults = { success: [], failed: [] };
      let completedCount = 0;

      for (const chunk of chunks) {
        try {
          const payload = {
            numbers: chunk,
            message: message || undefined,
            mediaPaths: mediaFiles,
          };

          console.log('Sending chunk:', payload);

          const response = await api.post('/send-bulk-messages', payload, {
            retry: 3,
            timeout: 120000, // 2 minutes per chunk
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (response.data.results) {
            allResults.success.push(...response.data.results.success);
            allResults.failed.push(...response.data.results.failed);
          }

          completedCount += chunk.length;
          setProgress(Math.round((completedCount / phoneNumbers.length) * 100));

          // Add a longer delay between chunks
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
          console.error('Chunk error:', error);
          allResults.failed.push(...chunk.map(number => ({
            number,
            reason: error.response?.data?.error || "فشل في الإرسال"
          })));
          
          // Add an even longer delay after an error
          await new Promise(resolve => setTimeout(resolve, 10000));
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
      toast.error(
        error.response?.data?.error || 
        "حدث خطأ في عملية الإرسال. يرجى المحاولة مرة أخرى"
      );
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