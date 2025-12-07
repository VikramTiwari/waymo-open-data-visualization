import { useState, useEffect, useRef, useCallback } from 'react';

export function useRecordBuffer(baseUrl, bufferLimit = 5) {
  const [currentRecord, setCurrentRecord] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  
  // Buffer state
  const bufferRef = useRef([]);
  const [bufferSize, setBufferSize] = useState(0);
  
  const isFetchingRef = useRef(false);
  const isStreamDoneRef = useRef(false);

  // Initialize stream
  useEffect(() => {
    const initStream = async () => {
      try {
        const res = await fetch(`${baseUrl}/init`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to init stream');
        setIsConnected(true);
        setError(null);
        isStreamDoneRef.current = false;
        bufferRef.current = [];
        setBufferSize(0);
      } catch (err) {
        console.error(err);
        setError(err);
        setIsConnected(false);
      }
    };

    initStream();
  }, [baseUrl]);

  // Fetch loop to keep buffer full
  useEffect(() => {
    if (!isConnected || error || isStreamDoneRef.current) return;

    const fetchNext = async () => {
      if (isFetchingRef.current || bufferRef.current.length >= bufferLimit) return;

      isFetchingRef.current = true;
      try {
        const res = await fetch(`${baseUrl}/next`);
        const json = await res.json();

        if (json.done) {
          isStreamDoneRef.current = true;
          console.log('Stream finished');
        } else {
          bufferRef.current.push({
            record: json.record,
            fileInfo: json.fileInfo,
            scenarioInfo: json.scenarioInfo
          });
          setBufferSize(bufferRef.current.length);
        }
      } catch (err) {
        console.error('Error fetching next record:', err);
        setError(err);
      } finally {
        isFetchingRef.current = false;
      }
    };

    // Poll frequently to keep buffer full
    const interval = setInterval(fetchNext, 50); // check often
    return () => clearInterval(interval);
  }, [isConnected, baseUrl, bufferLimit, error]);

  // Function to advance to next record
  const playNext = useCallback(() => {
    if (bufferRef.current.length > 0) {
      const next = bufferRef.current.shift();
      setBufferSize(bufferRef.current.length);
      setCurrentRecord(next); // next is now { record, fileInfo }
      return true;
    }
    return false;
  }, []);

  return { 
    data: currentRecord?.record,
    fileInfo: currentRecord?.fileInfo, 
    scenarioInfo: currentRecord?.scenarioInfo,
    isConnected, 
    error, 
    playNext, 
    bufferSize,
    isStreamDone: isStreamDoneRef.current 
  };
}
