import { PlaitBoard } from '@plait/core';
import { getDefaultName, serializeAsJSON } from './json';

export const saveToServer = async (
  board: PlaitBoard,
  name?: string
) => {
  const env = (import.meta as any).env || {};
  const explicitEndpoint = env?.VITE_UPLOAD_ENDPOINT as string | undefined;
  const isDev = !!env?.DEV;
  const fallbackDevEndpoint = 'http://localhost:8787/upload';

  const endpoint = explicitEndpoint || (isDev ? fallbackDevEndpoint : undefined);

  if (!endpoint) {
    alert('未配置上传端点：VITE_UPLOAD_ENDPOINT');
    return;
  }

  const dir = env?.VITE_UPLOAD_DIR as string | undefined;
  const token = env?.VITE_UPLOAD_TOKEN as string | undefined;

  // Determine filename. If not provided, fallback to default name.
  const finalName = (name && name.trim()) || getDefaultName();

  const serialized = serializeAsJSON(board);
  try {
    console.log('[saveToServer] endpoint =', endpoint);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        filename: `${finalName}.drawnix`,
        content: serialized,
        ...(dir ? { dir } : {}),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Upload failed:', res.status, text);
      alert(`保存失败：${res.status}`);
      return;
    }

    let data: any = null;
    try {
      data = await res.json();
    } catch {}

    alert('已保存到服务器');
    return data;
  } catch (err) {
    console.error('Upload error:', err);
    alert('保存失败：网络错误');
    return;
  }
};