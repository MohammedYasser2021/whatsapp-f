import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import FileUpload from "./components/FileUpload";
import MessageForm from "./components/MessageForm";
import StatusIndicator from "./components/StatusIndicator";
import { API_BASE_URL } from "./config";

// Configure axios defaults
axios.defaults.withCredentials = true;
axios.defaults.timeout = 30000; // 30 second timeout
axios.defaults.maxContentLength = 16 * 1024 * 1024; // 16MB max content length
axios.defaults.maxBodyLength = 16 * 1024 * 1024; // 16MB max body length

// Add retry logic
axios.interceptors.response.use(undefined, async (err) => {
  const { config, message } = err;
  if (!config || !config.retry) {
    return Promise.reject(err);
  }
  config.retry -= 1;
  if (config.retry === 0) {
    return Promise.reject(err);
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
  return axios(config);
});

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
      const response = await axios.get(`${API_BASE_URL}/status`);
      setStatus(response.data.status);
      setQrCode(response.data.qrCode);
    } catch (error) {
      console.error("Error checking status:", error);
    }
  };

  const handleDisconnect = async () => {
    try {
      await axios.post(`${API_BASE_URL}/disconnect`);
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

        const response = await axios.post(
          `${API_BASE_URL}/upload-media`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
            retry: 3,
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setProgress(percentCompleted);
            },
          }
        );

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
    let currentProgress = 0;

    try {
      const payload = {
        numbers: phoneNumbers,
        message: message || undefined,
        mediaPaths: mediaFiles,
      };

      const response = await axios.post(
        `${API_BASE_URL}/send-bulk-messages`,
        payload,
        {
          retry: 3,
          timeout: 300000, // 5 minutes timeout for bulk sending
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            currentProgress = percentCompleted;
            setProgress(percentCompleted);
          },
        }
      );

      setResults(response.data.results);
      
      const successCount = response.data.results.success.length;
      const failedCount = response.data.results.failed.length;

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