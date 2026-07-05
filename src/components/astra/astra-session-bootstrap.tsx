'use client';



import { useEffect } from 'react';



import { isRemotePersistenceEnabled } from '@/lib/astra/api-client';

import { ensureAstraWorkspaceKeyReady } from '@/lib/astra/workspace-session';



export function AstraSessionBootstrap() {

  useEffect(() => {

    if (!isRemotePersistenceEnabled()) {

      return;

    }



    void ensureAstraWorkspaceKeyReady();

  }, []);



  return null;

}


