import React, { useEffect } from 'react';
import { register } from '@adobe/uix-guest';
import metadata from '../../../../app-metadata.json';
import { extensionId } from './Constants';

export default function ExtensionRegistration() {
  useEffect(() => {
    const init = async () => {
      const getSecondaryNavItems = () => {
        // Preserves the /workfront-ui-1/ subpath dynamically
        const targetUrl = new URL('#/app', window.location.href).href;

        return [
          {
            id: 'bitly-analytics-tab',
            label: 'Bitly Analytics',
            url: targetUrl,
          },
        ];
      };

      await register({
        id: extensionId,
        metadata,
        methods: {
          id: extensionId, // Required by Workfront host to pair the iframe
          secondaryNav: {
            OPTASK: { getItems: getSecondaryNavItems },
            optask: { getItems: getSecondaryNavItems },
            ISSUE: { getItems: getSecondaryNavItems },
            issue: { getItems: getSecondaryNavItems },
            PROJECT: { getItems: getSecondaryNavItems },
            project: { getItems: getSecondaryNavItems },
            PROJ: { getItems: getSecondaryNavItems },
            proj: { getItems: getSecondaryNavItems },
          },
        },
      });
    };

    init().catch(console.error);
  }, []);

  return <div>Registering extension with Workfront...</div>;
}