/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

/**
 * this file is copy from https://github.com/facebook/react/tree/v18.0.0/packages/react-devtools-core/src/standalone.js
 * modify to support react-devtools in hippy
 */

import {createElement} from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import Bridge from 'react-devtools-shared/src/bridge';
import Store from 'react-devtools-shared/src/devtools/store';
import {registerDevToolsEventLogger} from 'react-devtools-shared/src/registerDevToolsEventLogger';
import {installHook} from 'react-devtools-shared/src/hook';
import DevTools from 'react-devtools-shared/src/devtools/views/DevTools';
// import {doesFilePathExist, launchEditor} from '../../react-devtools-core/src/editor';
import {
  __DEBUG__,
  LOCAL_STORAGE_DEFAULT_TAB_KEY,
} from 'react-devtools-shared/src/constants';
import {localStorageSetItem} from 'react-devtools-shared/src/storage';
import { createWS } from './ws';

import type {FrontendBridge} from 'react-devtools-shared/src/bridge';
import type {InspectedElement} from 'react-devtools-shared/src/devtools/views/Components/types';

installHook(window);

export type StatusTypes = 'server-connected' | 'devtools-connected' | 'error';
export type StatusListener = (message: string, status: StatusTypes) => void;
export type OnDisconnectedCallback = () => void;

let node: HTMLElement = ((null: any): HTMLElement);
let nodeWaitingToConnectHTML: string = '';
let projectRoots: Array<string> = [];
let statusListener: StatusListener = (
  message: string,
  status?: StatusTypes,
) => {};
let disconnectedCallback: OnDisconnectedCallback = () => {};

// TODO (Webpack 5) Hopefully we can remove this prop after the Webpack 5 migration.
function hookNamesModuleLoaderFunction() {
  return import(
    /* webpackChunkName: 'parseHookNames' */ 'react-devtools-shared/src/hooks/parseHookNames'
  );
}

function setContentDOMNode(value: HTMLElement) {
  node = value;

  // Save so we can restore the exact waiting message between sessions.
  nodeWaitingToConnectHTML = node.innerHTML;

  return DevtoolsUI;
}

function setProjectRoots(value: Array<string>) {
  projectRoots = value;
}

function setStatusListener(value: StatusListener) {
  statusListener = value;
  return DevtoolsUI;
}

function setDisconnectedCallback(value: OnDisconnectedCallback) {
  disconnectedCallback = value;
  return DevtoolsUI;
}

let bridge: FrontendBridge | null = null;
let store: Store | null = null;
let root = null;
let listeners = [];

const log = (...args) => console.log('[React DevTools]', ...args);
log.warn = (...args) => console.warn('[React DevTools]', ...args);
log.error = (...args) => console.error('[React DevTools]', ...args);

function debug(methodName: string, ...args) {
  if (__DEBUG__) {
    console.log(
      `%c[core/standalone] %c${methodName}`,
      'color: teal; font-weight: bold;',
      'font-weight: bold;',
      ...args,
    );
  }
}

function safeUnmount() {
  flushSync(() => {
    if (root !== null) {
      root.unmount();
      root = null;
    }
  });
}

function reload() {
  safeUnmount();

  node.innerHTML = '';

  setTimeout(() => {
    root = createRoot(node);
    root.render(
      createElement(DevTools, {
        bridge: ((bridge: any): FrontendBridge),
        canViewElementSourceFunction,
        hookNamesModuleLoaderFunction,
        showTabBar: true,
        store: ((store: any): Store),
        warnIfLegacyBackendDetected: true,
        viewElementSourceFunction,
      }),
    );
  }, 100);
}

function canViewElementSourceFunction(
  inspectedElement: InspectedElement,
): boolean {
  if (
    inspectedElement.canViewSource === false ||
    inspectedElement.source === null
  ) {
    return false;
  }

  const {source} = inspectedElement;

  // return doesFilePathExist(source.fileName, projectRoots);
}

function viewElementSourceFunction(
  id: number,
  inspectedElement: InspectedElement,
): void {
  const {source} = inspectedElement;
  if (source !== null) {
    // launchEditor(source.fileName, source.lineNumber, projectRoots);
  } else {
    log.error('Cannot inspect element', id);
  }
}

function onDisconnected() {
  safeUnmount();

  node.innerHTML = nodeWaitingToConnectHTML;

  disconnectedCallback();
}

function onError({code, message}) {
  safeUnmount();

  if (code === 'EADDRINUSE') {
    node.innerHTML = `
      <div class="box">
        <div class="box-header">
          Another instance of DevTools is running.
        </div>
        <div class="box-content">
          Only one copy of DevTools can be used at a time.
        </div>
      </div>
    `;
  } else {
    node.innerHTML = `
      <div class="box">
        <div class="box-header">
          Unknown error
        </div>
        <div class="box-content">
          ${message}
        </div>
      </div>
    `;
  }
}

function openProfiler() {
  // Mocked up bridge and store to allow the DevTools to be rendered
  bridge = new Bridge({listen: () => {}, send: () => {}});
  store = new Store(bridge, {});

  // Ensure the Profiler tab is shown initially.
  localStorageSetItem(
    LOCAL_STORAGE_DEFAULT_TAB_KEY,
    JSON.stringify('profiler'),
  );

  reload();
}

function initialize(socket: WebSocket) {
  // when reload hippy page, destroy all cached data, and rebuild the connection.
  if(bridge) {
    bridge.clean();

    store = null;
    bridge = null;
    listeners = [];
  }

  bridge = new Bridge({
    listen(fn) {
      listeners.push(fn);
      return () => {
        const index = listeners.indexOf(fn);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
    send(event: string, payload: any, transferable?: Array<any>) {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({event, payload}));
      }
    },
  });
  ((bridge: any): FrontendBridge).addListener('shutdown', () => {
    // socket.close();
    onDisconnected();
    log('backend shutdown');
    statusListener('devtools backend shutdown.', 'error');
  });

  store = new Store(bridge, {
    checkBridgeProtocolCompatibility: true,
    supportsNativeInspection: false,
  });

  log('Connected');
  statusListener('DevTools initialized.', 'devtools-connected');
  reload();
}

let startServerTimeoutID: TimeoutID | null = null;

type ServerOptions = {|
  key?: string,
  cert?: string,
|};

type LoggerOptions = {|
  surface?: ?string,
|};

function start() {
  registerDevToolsEventLogger('standalone');

  const ws = createWS();
  ws.onopen = () => {}
  ws.onmessage = msg => {
    let data;
    try {
      if (typeof event.data === 'string') {
        data = JSON.parse(event.data);

        if (__DEBUG__) {
          debug('WebSocket.onmessage', data);
        }
      } else {
        throw Error();
      }
    } catch (e) {
      log.error('Failed to parse JSON', event.data);
      return;
    }

    if(data.event === 'react-devtools-connect-backend') {
      return initialize(ws);
    }

    listeners.forEach(fn => {
      try {
        fn(data);
      } catch (error) {
        log.error('Error calling listener', data);
        throw error;
      }
    });
  };
  ws.onclose = () => {
    onDisconnected();
    log('Connection to RN closed');

    // TODO retry
    // onError(event);
    statusListener('devtools disconnect, refresh page to retry.', 'error');
    // startServerTimeoutID = setTimeout(() => start(), 1000);
  };
  ws.onerror = error => {
    onDisconnected();
    log.error('Error with websocket connection', error);
  };

  return {
    close: function() {
      onDisconnected();
      if (startServerTimeoutID !== null) {
        clearTimeout(startServerTimeoutID);
      }
    },
  };
}

const DevtoolsUI = {
  setContentDOMNode,
  setProjectRoots,
  setStatusListener,
  setDisconnectedCallback,
  start,
  openProfiler,
};

export default DevtoolsUI;
