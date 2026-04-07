import { useState, useEffect, useRef } from 'react';

export function AnimatedNumber({ value, duration = 500, prefix = '', suffix = '', decimals = 0 }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const frameRef = useRef(null);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    const diff = end - start;
    if (Math.abs(diff) < 0.01) { setDisplay(end); return; }

    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + diff * eased;
      setDisplay(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(end);
        prevRef.current = end;
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [value, duration]);

  const formatted = decimals > 0 ? display.toFixed(decimals) : Math.round(display);
  return <>{prefix}{typeof formatted === 'number' ? formatted.toLocaleString('en-IN') : Number(formatted).toLocaleString('en-IN')}{suffix}</>;
}
