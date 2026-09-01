/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Sharker 式简约 Google 新标签：画在 React 里，不走原生 WebContentsView。
 */
import { useState } from 'react';

export function BrowserStartPage(props: {
  placeholder: string;
  searchAria: string;
  searchSubmit: string;
  onSubmit(query: string): void;
}) {
  const [query, setQuery] = useState('');

  return (
    <div className="maka-browser-start">
      <div className="maka-browser-start-wrap">
        <h1 className="maka-browser-start-logo" aria-label="Google">
          <span>G</span>
          <span>o</span>
          <span>o</span>
          <span>g</span>
          <span>l</span>
          <span>e</span>
        </h1>
        <form
          className="maka-browser-start-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit(query);
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={props.placeholder}
            autoFocus
            aria-label={props.searchAria}
          />
          <button type="submit">{props.searchSubmit}</button>
        </form>
      </div>
    </div>
  );
}
