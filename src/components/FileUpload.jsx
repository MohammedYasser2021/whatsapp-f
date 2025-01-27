import React, { useState } from 'react';
import { Upload, File, X } from 'lucide-react';
import toast from 'react-hot-toast';

function FileUpload({ onExcelUpload, onMediaUpload }) {
  const [excelFile, setExcelFile] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);

  const handleExcelUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setExcelFile(file);
      onExcelUpload(file);
    }
  };

  const handleMediaUpload = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = Array.from(files);
      setMediaFiles(prev => [...prev, ...newFiles]);
      onMediaUpload(newFiles);
    }
  };

  const removeExcelFile = () => {
    setExcelFile(null);
  };

  const removeMediaFile = (index) => {
    const newFiles = mediaFiles.filter((_, i) => i !== index);
    setMediaFiles(newFiles);
    onMediaUpload(newFiles);
  };

  return (
    <div className="space-y-8 p-8 bg-white rounded-2xl shadow-xl max-w-3xl mx-auto" dir="rtl">
      <div className="space-y-6">
        {/* Excel Upload */}
        <div className="border-3 border-dashed border-blue-200 rounded-xl p-8 transition-all duration-300 hover:border-blue-400 bg-gradient-to-b from-blue-50/50 to-transparent">
          {!excelFile ? (
            <label className="cursor-pointer block text-center group">
              <div className="transform transition-transform group-hover:scale-105">
                <Upload className="mx-auto h-16 w-16 text-blue-400 group-hover:text-blue-500" />
                <span className="mt-4 block text-lg font-semibold text-gray-700">
                  ملف Excel (يحتوي على أرقام الهواتف)
                </span>
                <p className="text-sm text-gray-500 mt-2">اسحب الملف هنا أو اضغط للاختيار</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls"
                onChange={handleExcelUpload}
              />
            </label>
          ) : (
            <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-blue-100">
              <div className="flex items-center gap-4">
                <File className="h-8 w-8 text-blue-500" />
                <span className="text-md font-medium text-gray-700">{excelFile.name}</span>
              </div>
              <button
                onClick={removeExcelFile}
                className="p-2 rounded-full hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          )}
        </div>

        {/* Media Upload */}
        <div className="border-3 border-dashed border-purple-200 rounded-xl p-8 transition-all duration-300 hover:border-purple-400 bg-gradient-to-b from-purple-50/50 to-transparent">
          <label className="cursor-pointer block text-center group">
            <div className="transform transition-transform group-hover:scale-105">
              <Upload className="mx-auto h-16 w-16 text-purple-400 group-hover:text-purple-500" />
              <span className="mt-4 block text-lg font-semibold text-gray-700">
                ملف الوسائط (صور، فيديو، صوت)
              </span>
              <p className="text-sm text-gray-500 mt-2">يمكنك اختيار عدة ملفات</p>
            </div>
            <input
              type="file"
              className="hidden"
              accept="image/*,video/*,audio/*"
              multiple
              onChange={handleMediaUpload}
            />
          </label>

          {/* Media Files List */}
          {mediaFiles.length > 0 && (
            <div className="mt-6 space-y-3">
              {mediaFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-purple-100 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4">
                    <File className="h-8 w-8 text-purple-500" />
                    <span className="text-md font-medium text-gray-700">{file.name}</span>
                  </div>
                  <button
                    onClick={() => removeMediaFile(index)}
                    className="p-2 rounded-full hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FileUpload;