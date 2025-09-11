import { PlaitBoard } from '@plait/core';
import { getDefaultName, serializeAsJSON } from './json';

export const saveToServer = async (
  board: PlaitBoard,
  name: string = getDefaultName()
) => {
  const endpoint = (import.meta as any).env?.VITE_UPLOAD_ENDPOINT as
    | string
    | undefined;
  if (!endpoint) {
    alert('未配置上传端点：VITE_UPLOAD_ENDPOINT');
    return;
  }
  const dir = (import.meta as any).env?.VITE_UPLOAD_DIR as string | undefined;
  const token = (import.meta as any).env?.VITE_UPLOAD_TOKEN as
    | string
    | undefined;

  const serialized = serializeAsJSON(board);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        filename: `${name}.drawnix`,
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

    // 尝试解析响应
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