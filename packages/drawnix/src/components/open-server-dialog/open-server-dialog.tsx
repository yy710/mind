import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent } from '../dialog/dialog';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard, useListRender } from '@plait-board/react-board';
import { BoardTransforms, PlaitBoard, PlaitElement, CoreTransforms, Viewport } from '@plait/core';
import { isValidDrawnixData } from '../../data/json';

interface ServerFileItem {
  name: string;
  relativePath: string;
  dir?: string;
  size?: number;
  mtime?: number;
}

function getApiBase() {
  const env = (import.meta as any).env || {};
  const explicitUpload = env?.VITE_UPLOAD_ENDPOINT as string | undefined;

  const normalize = (base?: string) => {
    if (!base) return '';
    // Strip trailing "/upload" (with optional slash) and any trailing slashes
    let cleaned = base.replace(/\/?upload\/?$/, '');
    cleaned = cleaned.replace(/\/+$/, '');
    // Treat empty or root as same-origin
    if (cleaned === '' || cleaned === '/') return '';
    return cleaned;
  };

  // If explicitly configured, always respect it even if it normalizes to '' (same-origin)
  if (typeof explicitUpload === 'string') {
    return normalize(explicitUpload);
  }

  const isDev = !!env?.DEV;
  // If not explicitly configured, fallback: dev -> mock server; prod -> same-origin
  return isDev ? 'http://localhost:8787' : '';
}

export const OpenFromServerDialog = ({
  container,
}: {
  container: HTMLElement | null;
}) => {
  const { appState, setAppState } = useDrawnix();
  const { t } = useI18n();
  const board = useBoard();
  const listRender = useListRender();

  const token = (import.meta as any).env?.VITE_UPLOAD_TOKEN as string | undefined;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<ServerFileItem[]>([]);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apiBase = getApiBase();
      const url = `${apiBase}/files`;
      console.log('[OpenFromServerDialog] apiBase =', apiBase, 'GET', url);
      const res = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Unknown error');
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (appState.openServerDialog) {
      fetchFiles();
    }
  }, [appState.openServerDialog, fetchFiles]);

  const clearAndLoad = useCallback(
    (elements: PlaitElement[], viewport?: Viewport | null) => {
      // Clear existing elements
      if (board.children.length > 0) {
        CoreTransforms.removeElements(board, [...board.children]);
      }
      
      // Add new elements
      board.children = elements;
      
      // Set viewport if provided
      if (viewport) {
        board.viewport = viewport;
      }
      
      // Update the render
      listRender.update(board.children, {
        board: board,
        parent: board,
        parentG: PlaitBoard.getElementHost(board),
      });
      
      // Fit to viewport
      BoardTransforms.fitViewport(board);
    },
    [board, listRender]
  );

  const handleOpenFile = useCallback(async (item: ServerFileItem) => {
    try {
      const apiBase = getApiBase();
      const url = `${apiBase}/file?path=${encodeURIComponent(item.relativePath)}`;
      console.log('[OpenFromServerDialog] apiBase =', apiBase, 'GET', url);
      const res = await fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Unknown error');
      const content = String(data.content || '');
      const parsed = JSON.parse(content);
      if (!isValidDrawnixData(parsed)) {
        alert('Invalid file content');
        return;
      }
      clearAndLoad(parsed.elements, parsed.viewport);
      const baseName = (item.name || '').replace(/\.[^.]+$/, '') || null;
      setAppState({ ...appState, openServerDialog: false, currentFileName: baseName });
    } catch (e: any) {
      console.error('Open from server error:', e);
      alert(e?.message || 'Failed to open file');
    }
  }, [token, appState, setAppState, clearAndLoad]);

  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

  return (
    <Dialog
      open={appState.openServerDialog}
      onOpenChange={(open) => {
        setAppState({ ...appState, openServerDialog: open });
      }}
    >
      <DialogContent className="Dialog open-server-dialog" container={container}>
        <div className="open-server-dialog__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('menu.openFromServer')}</h2>
          <button onClick={() => setAppState({ ...appState, openServerDialog: false })}>
            {t('saveDialog.cancel')}
          </button>
        </div>
        {debug && (
          <div style={{ fontSize: 12, color: '#999', margin: '4px 0 8px' }}>
            apiBase: "{getApiBase()}" • origin: {typeof window !== 'undefined' ? window.location.origin : 'n/a'}
          </div>
        )}
        <div className="open-server-dialog__body" style={{ minWidth: 360, maxWidth: 520 }}>
          {loading && <div style={{ padding: 8 }}>Loading…</div>}
          {error && (
            <div style={{ padding: 8, color: 'red' }}>
              {error}
              <button style={{ marginLeft: 12 }} onClick={fetchFiles}>Retry</button>
            </div>
          )}
          {!loading && !error && (
            <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--color-border, #ddd)', borderRadius: 4 }}>
              {files.length === 0 ? (
                <div style={{ padding: 10, color: '#666' }}>No files found</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {files.map((f) => (
                    <li key={f.relativePath} style={{ borderBottom: '1px solid #eee' }}>
                      <button
                        style={{
                          display: 'flex',
                          width: '100%',
                          padding: '8px 12px',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        onClick={() => handleOpenFile(f)}
                        title={f.relativePath}
                      >
                        <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 300 }}>{f.name}</span>
                        <span style={{ color: '#999', fontSize: 12 }}>{f.size ? `${f.size} B` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};