import { useEffect, useRef } from 'react';
import { GanttApp } from './ganttController';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appInstanceRef = useRef<GanttApp | null>(null);

  useEffect(() => {
    if (containerRef.current && !appInstanceRef.current) {
      appInstanceRef.current = new GanttApp(containerRef.current);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-screen overflow-hidden flex flex-col bg-white"
      id="gantt-root-container"
    />
  );
}
