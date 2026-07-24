import React from 'react';
import { Check } from 'lucide-react';

interface ToastProps {
  message: string;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="fixed right-5 bottom-5 bg-[#261732] text-[#E7E0D6] px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-xs font-bold z-50 animate-slide-up">
      <Check size={16} />
      {message}
    </div>
  );
};