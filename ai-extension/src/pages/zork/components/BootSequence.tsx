import React, { useEffect, useState } from 'react';

interface BootSequenceProps {
  onComplete: () => void;
}

const BOOT_LINES = [
  { text: 'CHROME OS BOOT v1.0', delay: 0 },
  { text: 'LOADING...', delay: 500 },
  { text: '', delay: 800, isProgress: true },
  { text: '', delay: 2500 },
  { text: 'INITIALIZING GEMINI NANO AI ENGINE...', delay: 2700 },
  { text: '[OK]', delay: 3200 },
  { text: '', delay: 3400 },
  { text: 'LOADING INFINITE DUNGEON GENERATOR...', delay: 3600 },
  { text: '[OK]', delay: 4100 },
  { text: '', delay: 4300 },
  { text: 'CALIBRATING REALITY MATRIX...', delay: 4500 },
  { text: '[OK]', delay: 5000 },
  { text: '', delay: 5200 },
  { text: '', delay: 5400, isAscii: true },
  { text: '', delay: 6400 },
  { text: 'WELCOME TO ZORK: INFINITE EDITION', delay: 6600 },
  { text: 'Powered by Gemini Nano', delay: 6800 },
  { text: '', delay: 7000 },
  { text: 'Press ENTER to begin your adventure...', delay: 7200 },
];

const ZORK_ASCII = `
███████╗ ██████╗ ██████╗ ██╗  ██╗
╚══███╔╝██╔═══██╗██╔══██╗██║ ██╔╝
  ███╔╝ ██║   ██║██████╔╝█████╔╝ 
 ███╔╝  ██║   ██║██╔══██╗██╔═██╗ 
███████╗╚██████╔╝██║  ██║██║  ██╗
╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
    INFINITE EDITION
`;

export const BootSequence: React.FC<BootSequenceProps> = ({ onComplete }) => {
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [progress, setProgress] = useState(0);
  const [canStart, setCanStart] = useState(false);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    BOOT_LINES.forEach((line, index) => {
      const timer = setTimeout(() => {
        setVisibleLines(index + 1);
        if (index === BOOT_LINES.length - 1) {
          setCanStart(true);
        }
      }, line.delay);
      timers.push(timer);
    });

    // Progress bar animation
    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressTimer);
          return 100;
        }
        return prev + 5;
      });
    }, 50);
    timers.push(progressTimer);

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!canStart) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        onComplete();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [canStart, onComplete]);

  return (
    <div className="boot-sequence">
      {BOOT_LINES.slice(0, visibleLines).map((line, index) => {
        if (line.isProgress) {
          return (
            <div key={index} className="boot-line" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          );
        }

        if (line.isAscii) {
          return (
            <pre key={index} className="ascii-art boot-line" style={{ animationDelay: `${index * 0.1}s` }}>
              {ZORK_ASCII}
            </pre>
          );
        }

        return (
          <div key={index} className="boot-line" style={{ animationDelay: `${index * 0.1}s` }}>
            {line.text}
          </div>
        );
      })}
    </div>
  );
};
