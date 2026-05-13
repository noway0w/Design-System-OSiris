/**
 * CAD conversion for DWG/3DM solid-only files (server-side or external API).
 * Configure: window.CAD_CONVERT_API_URL (preferred) or window.CAD_CONVERSION_URL
 */
(function (global) {
  'use strict';

  function resolveEndpoint() {
    if (typeof global.CAD_CONVERT_API_URL === 'string' && global.CAD_CONVERT_API_URL.trim()) {
      return global.CAD_CONVERT_API_URL.trim();
    }
    if (typeof global.CAD_CONVERSION_URL === 'string' && global.CAD_CONVERSION_URL.trim()) {
      return global.CAD_CONVERSION_URL.trim();
    }
    try {
      return new URL('../api/convert.php', global.location.href).href;
    } catch (_) {
      return 'api/convert.php';
    }
  }

  function normalizeArrayBuffer(buffer) {
    if (!buffer) return null;
    if (buffer instanceof ArrayBuffer) return buffer;
    if (buffer.buffer && typeof buffer.byteLength === 'number') {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    return null;
  }

  class CadConversionService {
    static canConvert(file) {
      const name = typeof file === 'string' ? file : (file && file.name) || '';
      const ext = (name.split('.').pop() || '').toLowerCase();
      return ext === 'dwg' || ext === '3dm';
    }

    /**
     * @param {{ name: string, buffer: ArrayBuffer|ArrayBufferView }} fileRef
     * @returns {Promise<{
     *   ok: true,
     *   arrayBuffer: ArrayBuffer,
     *   newName: string,
     *   extension: string,
     *   contentType: string
     * } | {
     *   ok: false,
     *   code: string,
     *   hint: string,
     *   error: string
     * }>}
     */
    static async convert(fileRef) {
      const name = (fileRef && fileRef.name) || 'model';
      const ab0 = normalizeArrayBuffer(fileRef && fileRef.buffer);
      if (!ab0) {
        return {
          ok: false,
          code: 'NO_BUFFER',
          hint: 'No file data was available for conversion. Export as STEP (.stp) and import again.',
          error: 'No buffer'
        };
      }

      const endpoint = resolveEndpoint();
      const fd = new FormData();
      fd.append('file', new Blob([ab0]), name);

      try {
        const res = await fetch(endpoint, { method: 'POST', body: fd });
        if (res.status === 404) {
          return {
            ok: false,
            code: 'NO_ENDPOINT',
            hint: 'Optimization hint: CAD conversion API is not available. Export as STEP (.stp) for web rendering.',
            error: 'Endpoint not found'
          };
        }

        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
          const j = await res.json().catch(() => ({}));
          if (j.downloadUrl || j.url) {
            return {
              ok: false,
              code: 'REDIRECT_NOT_SUPPORTED',
              hint: j.hint || 'Server returned a URL instead of a file. Configure binary streaming on convert.php.',
              error: 'JSON redirect',
              downloadUrl: j.downloadUrl || j.url
            };
          }
          if (j.ok === false || j.error) {
            return {
              ok: false,
              code: j.code || 'CONVERT_FAILED',
              hint: j.hint || j.error || 'Conversion failed. Export as STEP (.stp) from your CAD application.',
              error: j.error || 'Conversion failed'
            };
          }
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          let hint = text;
          try {
            const j = JSON.parse(text);
            if (j.hint) hint = j.hint;
            else if (j.error) hint = j.error;
          } catch (_) {}
          return {
            ok: false,
            code: 'HTTP_ERROR',
            hint: hint || 'Conversion request failed. Export as STEP (.stp) and import again.',
            error: res.statusText
          };
        }

        const outBuf = await res.arrayBuffer();
        if (!outBuf || outBuf.byteLength === 0) {
          return {
            ok: false,
            code: 'EMPTY',
            hint: 'Optimization hint: server returned an empty file. Export as STEP (.stp) and import again.',
            error: 'Empty response'
          };
        }

        const disp = res.headers.get('content-disposition') || '';
        let newName = name.replace(/\.(3dm|dwg)$/i, '.stp');
        const m = /filename\*?=(?:UTF-8''|)([^;\r\n]+)/i.exec(disp);
        if (m) {
          try {
            newName = decodeURIComponent(m[1].replace(/"/g, '').trim());
          } catch (_) {}
        }
        const ext = (newName.split('.').pop() || '').toLowerCase();
        return {
          ok: true,
          arrayBuffer: outBuf,
          newName,
          extension: ext,
          contentType: ct || 'application/octet-stream'
        };
      } catch (e) {
        return {
          ok: false,
          code: 'NETWORK',
          hint: 'Optimization hint: could not reach the conversion service. Export as STEP (.stp) and import again.',
          error: e && e.message ? e.message : String(e)
        };
      }
    }
  }

  global.CadConversionService = CadConversionService;
})(typeof window !== 'undefined' ? window : globalThis);
