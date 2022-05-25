/*
 * Tencent is pleased to support the open source community by making
 * Hippy available.
 *
 * Copyright (C) 2017-2019 THL A29 Limited, a Tencent company.
 * All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const DEBUG_URL = window.parent.location.href;
export function createWS () {
  const getUrlParam = (key) => new URL(DEBUG_URL).searchParams.get(key) || ''
  const url = new URL(DEBUG_URL)
  const wsParam = url.searchParams.get('ws')
  const wssParam = url.searchParams.get('wss')
  const newUrl = new URL(wsParam ? `ws://${wsParam}` : `wss://${wssParam}`)
  newUrl.searchParams.set('extensionName', `react-devtools`)
  newUrl.searchParams.set('role', `react_devtools`)
  newUrl.searchParams.set('hash', getUrlParam('hash'))
  const wsUrl = newUrl.toString()
  console.info(wsUrl)
  const ws = new WebSocket(wsUrl)
  return ws;
}
