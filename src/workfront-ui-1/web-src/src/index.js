import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import App from './components/App';
import ExtensionRegistration from './components/ExtensionRegistration';

function Root() {
  const [isAppView, setIsAppView] = useState(() => {
    const hash = window.location.hash || '';
    return hash.includes('app') || hash.includes('admin');
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash || '';
      setIsAppView(hash.includes('app') || hash.includes('admin'));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return isAppView ? <App /> : <ExtensionRegistration />;
}

ReactDOM.render(<Root />, document.getElementById('root'));