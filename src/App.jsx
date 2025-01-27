import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import FileUpload from "./components/FileUpload";
import MessageForm from "./components/MessageForm";
import StatusIndicator from "./components/StatusIndicator";
import { API_BASE_URL } from "./config";

function App() {
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [message, setMessage] = useState("");
  const [mediaFiles, setMediaFiles] = useState([]);
  const [status, setStatus] = useState("disconnected");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [hasMedia, setHasMedia] = useState(false);
  const [qrCode, setQrCode] = useState(null);

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
            return (
              row["Phone Number"] ||
              row["رقم الهاتف"] ||
              row["phone"] ||
              row["Phone"] ||
              row["الموبايل"] ||
              row["رقم الموبايل"] ||
              row["رقم"] ||
              row["phone number"] ||
              row["أرقام الهاتف"] ||
              row["ارقام الهاتف"] ||
              row["ارقام الهواتف"] ||
              row["أرقام الهواتف"]
            );
          })
          .filter(Boolean);

        setPhoneNumbers(numbers);
        toast.success(`تم تحميل ${numbers.length} رقم`);
      } catch (error) {
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

        const response = await axios.post(
          `${API_BASE_URL}/upload-media`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          }
        );

        uploadedFiles.push(response.data.filePath);
      }

      setMediaFiles(uploadedFiles);
      setHasMedia(true);
      toast.success("تم رفع الملفات بنجاح");
    } catch (error) {
      toast.error("فشل رفع الملفات");
    } finally {
      setIsLoading(false);
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
      const payload = {
        numbers: phoneNumbers,
        message: message || undefined,
        mediaPaths: mediaFiles,
      };

      const response = await axios.post(
        `${API_BASE_URL}/send-bulk-messages`,
        payload
      );
      setResults(response.data.results);
      console.log("Response data:", response.data.results);

      const successCount = response.data.results.success.length;
      const failedCount = response.data.results.failed.length;

      toast.success(
        `تم الإرسال بنجاح إلى ${successCount} رقم، وفشل الإرسال إلى ${failedCount} رقم`
      );
    } catch (error) {
      toast.error("حدث خطأ في عملية الإرسال");
      console.error("Error details:", error);
    } finally {
      setIsLoading(false);
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
        />

        <FileUpload
          onExcelUpload={handleExcelUpload}
          onMediaUpload={handleMediaUpload}
        />

        <MessageForm
          message={message}
          setMessage={setMessage}
          onSend={sendMessages}
          isLoading={isLoading}
          hasMedia={hasMedia}
        />
      </div>
    </div>
  );
}

export default App;
