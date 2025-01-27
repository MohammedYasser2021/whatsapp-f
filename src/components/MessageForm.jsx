import React from 'react';
import { Send } from 'lucide-react';

function MessageForm({ message, setMessage, onSend, isLoading, hasMedia }) {
  return (
    <div className="p-8 bg-white rounded-2xl shadow-lg space-y-6 max-w-3xl mx-auto" dir="rtl">
      <div className="space-y-3">
        <label htmlFor="message" className="block text-lg font-semibold text-gray-800 text-right">
          الرسالة
        </label>
        <textarea
          id="message"
          rows={4}
          className="block w-full rounded-xl border border-gray-200 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:text-md text-right p-4 transition duration-200 ease-in-out resize-none"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="اكتب رسالتك هنا..."
          dir="rtl"
        />
      </div>

      <button
        onClick={onSend}
        disabled={isLoading || (!message && !hasMedia)}
        className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-md font-medium rounded-xl text-white transition-all duration-200 ease-in-out transform hover:scale-[1.02] 
          ${isLoading || (!message && !hasMedia)
            ? 'bg-gray-400 cursor-not-allowed opacity-75'
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg'
          }`}
      >
        {isLoading ? (
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white ml-3"></div>
            <span>جاري الإرسال...</span>
          </div>
        ) : (
          <div className="flex items-center">
            <span className="text-lg">إرسال</span>
            <Send className="ml-3 h-5 w-5" />
          </div>
        )}
      </button>
    </div>
  );
}

export default MessageForm;
