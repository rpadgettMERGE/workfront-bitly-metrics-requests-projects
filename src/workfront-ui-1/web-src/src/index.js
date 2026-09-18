import React from 'react';
import ReactDOM from 'react-dom';
import App from './components/App';
import ExtensionRegistration from './components/ExtensionRegistration';

// Capture both the Project/Issue view and the new Global Admin view (with or without the slash)
const hash = window.location.hash;
const isAppView = hash === '#app' || hash === '#/app' || hash === '#admin' || hash === '#/admin';

ReactDOM.render(
  isAppView ? <App /> : <ExtensionRegistration />,
  document.getElementById('root')
);