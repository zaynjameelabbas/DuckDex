import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import { Camera } from 'lucide-react';

const videoConstraints = {
  facingMode: 'environment',
};

export default function Scanner({ onScan }) {
  const webcamRef = useRef(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!scanning) return;
    const interval = setInterval(() => {
      if (webcamRef.current) {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc && onScan) {
          onScan(imageSrc);
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [scanning, onScan]);

  return (
    <div className="flex flex-col items-center">
      {scanning ? (
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/png"
          videoConstraints={videoConstraints}
          className="rounded-lg w-full max-w-xs border border-yellow-400 shadow-lg"
        />
      ) : (
        <div className="w-full max-w-xs h-48 flex items-center justify-center bg-yellow-100 border-2 border-dashed border-yellow-400 rounded-lg">
          <Camera className="text-yellow-500 w-12 h-12" />
        </div>
      )}
      <button
        className={`mt-4 p-2 px-6 rounded-full flex items-center justify-center shadow-lg font-semibold transition-colors ${scanning ? 'bg-red-500 text-white' : 'bg-yellow-400 text-yellow-900 hover:bg-yellow-300'}`}
        onClick={() => setScanning((s) => !s)}
      >
        <Camera className="mr-2" />
        {scanning ? 'Stop Scanning' : 'Start Scanning'}
      </button>
    </div>
  );
}
