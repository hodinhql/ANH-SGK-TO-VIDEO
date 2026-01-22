
import React from 'react';
import { GeneratedImage, GenerationStatus } from '../types';

interface ImageCardProps {
  image: GeneratedImage;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

const ImageCard: React.FC<ImageCardProps> = ({ image, onRetry, onRemove }) => {
  return (
    <div className="group relative bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      {/* Action Overlays (Hidden by default, visible on group hover) */}
      <div className="absolute top-3 right-3 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <button 
          onClick={() => onRemove(image.id)}
          className="p-2 bg-white/90 backdrop-blur text-slate-400 hover:text-red-500 rounded-xl shadow-lg transition-colors"
          title="Xóa"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Main Image Container */}
      <div className="relative aspect-square bg-slate-50 overflow-hidden">
        {image.status === GenerationStatus.PENDING && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-50/30 backdrop-blur-[2px]">
            <div className="relative">
               <div className="w-12 h-12 border-[3px] border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
               </div>
            </div>
            <p className="mt-4 text-[13px] font-semibold text-indigo-600 tracking-wide uppercase">Đang xử lý...</p>
          </div>
        )}

        {image.status === GenerationStatus.SUCCESS && image.url && (
          <>
            <img 
              src={image.url} 
              alt={image.prompt} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
            {/* Download Quick Overlay */}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
               <a 
                href={image.url} 
                download={`ai-image-${image.id}.png`}
                className="p-3 bg-white rounded-full text-indigo-600 shadow-2xl transform scale-90 group-hover:scale-100 transition-transform duration-300"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                 </svg>
               </a>
            </div>
          </>
        )}

        {image.status === GenerationStatus.ERROR && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-red-50/50">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-xs text-red-600 font-medium mb-4 line-clamp-2 px-4">{image.error || 'Yêu cầu không thành công'}</p>
            <button 
              onClick={() => onRetry(image.id)}
              className="px-4 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors"
            >
              Thử lại
            </button>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="p-4 bg-white border-t border-slate-50">
        <div className="flex items-start gap-2 mb-1">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mt-1 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
           </svg>
           <p className="text-[13px] text-slate-500 font-medium line-clamp-2 leading-relaxed italic">
             {image.prompt}
           </p>
        </div>
      </div>
    </div>
  );
};

export default ImageCard;
