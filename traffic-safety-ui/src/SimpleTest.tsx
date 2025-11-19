import React from 'react';

const SimpleTest: React.FC = () => {
  return (
    <div style={{ 
      padding: '50px', 
      backgroundColor: '#1a1a1a', 
      color: 'white', 
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '3rem', color: '#4CAF50', marginBottom: '30px' }}>
        ✅ React is Working!
      </h1>
      <p style={{ fontSize: '1.5rem', marginBottom: '30px' }}>
        If you can see this, the React app is loading correctly.
      </p>
      <div style={{ 
        backgroundColor: '#2a2a2a', 
        padding: '30px', 
        borderRadius: '10px',
        maxWidth: '600px',
        margin: '0 auto'
      }}>
        <h2 style={{ color: '#ff6b6b', marginBottom: '20px' }}>Next Step: Test Alarm</h2>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.6' }}>
          The alarm system should work now. Try refreshing the page or check the browser console for any errors.
        </p>
        <button 
          onClick={() => alert('Button clicked! React is working perfectly.')}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            marginTop: '20px'
          }}
        >
          Test Button Click
        </button>
      </div>
    </div>
  );
};

export default SimpleTest;
