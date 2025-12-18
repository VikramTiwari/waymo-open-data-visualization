import { useState, useEffect, useRef, useCallback } from 'react';
import {
  parseMap,
  calculateCenter,
  parseAgents,
  parseTrafficLights,
  parsePathSamples,
  parseSdcState,
  calculateSdcSpeeds,
  parseScenarioId
} from '../utils/parsers';

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
          // Parse data before adding to buffer
          const rawData = json.record;
          const parsedMap = parseMap(rawData);
          const center = calculateCenter(parsedMap);

          const parsedData = {
              parsedMap,
              center,
              scenarioId: parseScenarioId(parsedMap),
              parsedAgents: parseAgents(parsedMap, center),
              parsedTrafficLights: parseTrafficLights(parsedMap, center),
              parsedPathSamples: parsePathSamples(parsedMap, center),
              parsedSdcState: parseSdcState(parsedMap, center),
              sdcSpeeds: calculateSdcSpeeds(parsedMap),
              raw: rawData // Keep raw just in case
          };

          bufferRef.current.push({
            data: parsedData,
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
      setCurrentRecord(next); // next is now { data, fileInfo, scenarioInfo }
      return true;
    }
    return false;
  }, []);

  return { 
    data: currentRecord?.data, // This is now the PARSED data object
    fileInfo: currentRecord?.fileInfo, 
    scenarioInfo: currentRecord?.scenarioInfo,
    isConnected, 
    error, 
    playNext, 
    bufferSize,
    isStreamDone: isStreamDoneRef.current 
  };
}
