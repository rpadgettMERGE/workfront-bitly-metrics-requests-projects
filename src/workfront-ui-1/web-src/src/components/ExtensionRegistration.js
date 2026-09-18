import React, { useEffect } from 'react';
import { Text } from "@adobe/react-spectrum";
import { register } from "@adobe/uix-guest";
import metadata from '../../../../app-metadata.json'; 

export default function ExtensionRegistration() {
  useEffect(() => {
    const init = async () => {
      // Inlined scope definition prevents bundler ReferenceError
      const getSecondaryNavItems = () => [
        {
          id: "bitly-analytics-tab",
          label: "Bitly Analytics",
          url: "/index.html#/app", 
        },
      ];

      await register({
        id: metadata.name, 
        metadata, 
        methods: {
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

  return <Text>IFrame for integration with Host (Workfront)...</Text>;
}