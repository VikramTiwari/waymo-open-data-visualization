import React, { useEffect } from 'react';
import { Scene } from './Scene';
import { useRecordBuffer } from './hooks/useRecordBuffer';

function App() {
  const { data, isConnected, playNext, bufferSize } = useRecordBuffer('http://localhost:3000');


  // No auto-play of records. User advances manually.
  
  // Initial load: Try to play next if we have data in buffer and no current data
  useEffect(() => {
    if (isConnected && !data && bufferSize > 0) {
        playNext();
    }
  }, [isConnected, data, bufferSize, playNext]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Scene data={data} onFinished={() => {
        console.log('Scenario finished, loading next...');
        playNext();
      }} />
    </div>
  );
}

export default App;
