(function () {
  const form = document.getElementById('itsmForm');
  const statusEl = document.getElementById('status');
  const resetButton = document.getElementById('resetButton');
  const generateButton = document.getElementById('generateButton');
  const addDeviceButton = document.getElementById('addDeviceButton');
  const devicesEl = document.getElementById('devices');
  const deviceTemplate = document.getElementById('deviceTemplate');
  const draftKey = '8fulfill-draft-v11';

  const topFields = [
    'templateType', 'ticketId', 'city', 'date', 'unitName',
    'employeeId', 'phone', 'address'
  ];

  const deviceFields = [
    'userName', 'deviceType', 'model', 'serialNumber', 'manufactureDate', 'config',
    'assetCode', 'assetName', 'mainboard', 'chip', 'ram', 'hardDrive',
    'keyboard', 'mouse', 'adapter', 'battery', 'otherParts',
    'dataStatus', 'deviceCondition', 'remedy', 'userSuggestion',
    'itProposal', 'itAssessment', 'note'
  ];

  const defaultDevice = {
    deviceType: 'Desktop',
    mainboard: 'Có',
    keyboard: 'Không',
    mouse: 'Không',
    adapter: 'Có',
    battery: 'Không',
    dataStatus: 'Nguyên vẹn',
    remedy: 'Hoàn trả'
  };

  function todayInputValue() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 10);
  }

  function setStatus(message, isError) {
    statusEl.textContent = message || '';
    statusEl.classList.toggle('error', Boolean(isError));
  }

  function setDeviceField(card, field, value) {
    const input = card.querySelector(`[data-field="${field}"]`);
    if (!input || value === undefined || value === '') return;
    input.value = value;
  }

  let ocrWorkerPromise;

  function setOcrResult(card, message, isError) {
    const result = card.querySelector('[data-ocr-result]');
    if (result) {
      result.textContent = message || '';
      result.classList.toggle('error', Boolean(isError));
    }
  }

  async function getOcrWorker() {
    if (!window.Tesseract) {
      throw new Error('OCR engine is not loaded.');
    }
    if (!ocrWorkerPromise) {
      ocrWorkerPromise = Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
        workerPath: 'vendor/tesseract/worker.min.js',
        corePath: 'vendor/tesseract-core',
        langPath: 'vendor/tessdata',
        cacheMethod: 'readOnly',
        logger: (message) => {
          if (message.status === 'recognizing text') {
            setStatus(`OCR scanning ${Math.round((message.progress || 0) * 100)}%...`);
          }
        }
      }).then(async (worker) => {
        await worker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
          preserve_interword_spaces: '1',
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /-_.:#'
        });
        return worker;
      });
    }
    return ocrWorkerPromise;
  }

  async function prepareOcrImage(file) {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1800;
    const scale = Math.min(2, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
      data[i] = contrast;
      data[i + 1] = contrast;
      data[i + 2] = contrast;
    }
    ctx.putImageData(image, 0, 0);
    bitmap.close?.();
    return canvas;
  }

  function cleanOcrText(text) {
    return text
      .replace(/[|]/g, 'I')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\r/g, '\n');
  }

  function cleanAssetDigits(value) {
    const cleaned = value
      .toUpperCase()
      .replace(/[OQD]/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/[^0-9]/g, '');
    return cleaned.length >= 5 ? cleaned : '';
  }

  function extractPrl(text) {
    const lines = cleanOcrText(text).toUpperCase().split(/\n+/);
    for (const line of lines) {
      const labeled = line.match(/\bP\s*R\s*L\b\s*[:#.-]?\s*(.+)$/);
      if (!labeled) continue;
      const token = (labeled[1].match(/[A-Z0-9]{5,14}/g) || [])[0] || '';
      const digits = cleanAssetDigits(token);
      if (digits) return `PRL ${digits}`;
    }

    const compact = cleanOcrText(text).toUpperCase().replace(/\s+/g, '');
    const compactMatch = compact.match(/PRL([A-Z0-9]{5,14})/);
    if (!compactMatch) return '';
    const digits = cleanAssetDigits(compactMatch[1]);
    return digits ? `PRL ${digits}` : '';
  }

  function cleanSerialCandidate(value) {
    const cleaned = value
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .replace(/^-+|-+$/g, '');
    if (cleaned.length < 5 || cleaned.length > 24) return '';
    if (/^PRL/.test(cleaned) || /^20\d{2}$/.test(cleaned)) return '';
    if (/^(MODEL|SERIAL|NUMBER|PRODUCT|SERVICE|TAG)$/.test(cleaned)) return '';
    return cleaned;
  }

  function extractSerial(text) {
    const lines = cleanOcrText(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const labelPattern = /\b(?:SERIAL(?:\s*(?:NUMBER|NO|N0))?|S\s*\/\s*N|S\s*N|SERVICE\s*TAG|TAG)\b\s*[:#.-]?\s*([A-Z0-9-]{5,24})/i;

    for (const line of lines) {
      const match = line.match(labelPattern);
      const serial = match ? cleanSerialCandidate(match[1]) : '';
      if (serial) return serial;
    }

    const prl = extractPrl(text).replace(/\s+/g, '');
    const candidates = cleanOcrText(text).toUpperCase().match(/\b[A-Z0-9][A-Z0-9-]{5,23}\b/g) || [];
    for (const candidate of candidates) {
      const serial = cleanSerialCandidate(candidate);
      if (!serial || serial === prl) continue;
      if (!/[A-Z]/.test(serial) || !/[0-9]/.test(serial)) continue;
      if (/^(CORE|DDR|NVME|SATA|LAPTOP|DESKTOP|LASERJET|INSPIRON|LATITUDE|OPTIPLEX)/.test(serial)) continue;
      return serial;
    }
    return '';
  }

  function cleanModelCandidate(value, serial) {
    let cleaned = value
      .replace(/\b(?:MODEL|MODEL NO|PRODUCT NAME|PRODUCT|DEVICE NAME|TYPE|MACHINE TYPE|NAME)\b\s*[:#.-]?\s*/ig, '')
      .replace(/\b(?:SERIAL|SERIAL NUMBER|S\/N|SN|SERVICE TAG)\b.*$/ig, '')
      .replace(/\bPRL\s*[A-Z0-9\s-]+$/ig, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (serial) cleaned = cleaned.replace(new RegExp(serial.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'ig'), '').trim();
    cleaned = cleaned.replace(/^[-:.\s]+|[-:.\s]+$/g, '');
    if (cleaned.length < 4 || cleaned.length > 80) return '';
    if (/^\d+$/.test(cleaned) || /\b(?:SERIAL|WARRANTY|DATE|MFG|MADE IN)\b/i.test(cleaned)) return '';
    return cleaned;
  }

  function inferModelFromOcrText(text, serial) {
    const lines = cleanOcrText(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const explicit = /\b(?:MODEL(?:\s*NO)?|PRODUCT(?:\s*NAME)?|DEVICE\s*NAME|MACHINE\s*TYPE)\b\s*[:#.-]?\s*(.+)$/i;
    for (const line of lines) {
      const match = line.match(explicit);
      const model = match ? cleanModelCandidate(match[1], serial) : '';
      if (model) return model;
    }

    const joined = lines.join(' ');
    const brandPatterns = [
      /\b(Dell\s+(?:Latitude|Inspiron|Vostro|OptiPlex|Precision|XPS)\s+[A-Z0-9-]+)\b/i,
      /\b(HP\s+(?:LaserJet|EliteBook|ProBook|EliteDesk|ProDesk|ZBook|Pavilion)\s+[A-Z0-9-]+(?:\s+[A-Z0-9-]+)?)\b/i,
      /\b(Lenovo\s+(?:ThinkPad|ThinkCentre|IdeaPad|Yoga)\s+[A-Z0-9-]+(?:\s+[A-Z0-9-]+)?)\b/i,
      /\b(Canon\s+[A-Z]{1,5}[-\s]?[0-9A-Z-]+)\b/i,
      /\b(Brother\s+[A-Z]{1,5}[-\s]?[0-9A-Z-]+)\b/i
    ];
    for (const pattern of brandPatterns) {
      const match = joined.match(pattern);
      const model = match ? cleanModelCandidate(match[1], serial) : '';
      if (model) return model;
    }

    if (serial) {
      const serialIndex = lines.findIndex((line) => line.toUpperCase().includes(serial.toUpperCase()));
      const nearby = serialIndex >= 0 ? lines.slice(Math.max(0, serialIndex - 3), serialIndex + 2) : [];
      for (const line of nearby) {
        const model = cleanModelCandidate(line, serial);
        if (model && /[A-Z]/i.test(model) && !/\b(PRL|SERIAL|SN|SERVICE|TAG)\b/i.test(model)) {
          return model;
        }
      }
    }
    return '';
  }

  function detectTypeFromModel(model) {
    if (/\b(laserjet|printer|canon|brother|máy\s*in)\b/i.test(model)) return 'Máy in';
    if (/\b(monitor|màn\s*hình)\b/i.test(model)) return 'Màn hình';
    if (/\b(laptop|latitude|inspiron|vostro|xps|elitebook|probook|thinkpad|ideapad)\b/i.test(model)) return 'Laptop';
    if (/\b(optiplex|desktop|thinkcentre|elitedesk|prodesk)\b/i.test(model)) return 'Desktop';
    return '';
  }

  async function runDeviceOcr(card) {
    const file = card.querySelector('[data-field="ocrImage"]')?.files?.[0];
    if (!file) {
      setOcrResult(card, 'Choose a label photo first.', true);
      return;
    }

    const button = card.querySelector('[data-run-ocr]');
    button.disabled = true;
    setOcrResult(card, 'Scanning locally...');
    setStatus('OCR loading...');
    try {
      const image = await prepareOcrImage(file);
      const worker = await getOcrWorker();
      const { data } = await worker.recognize(image);
      const text = data.text || '';
      const assetCode = extractPrl(text);
      const serialNumber = extractSerial(text);
      const model = inferModelFromOcrText(text, serialNumber);
      const deviceType = model ? detectTypeFromModel(model) : '';

      if (assetCode) setDeviceField(card, 'assetCode', assetCode);
      if (serialNumber) setDeviceField(card, 'serialNumber', serialNumber);
      if (model) setDeviceField(card, 'model', model);
      if (deviceType) setDeviceField(card, 'deviceType', deviceType);

      const found = [
        assetCode ? `PRL ${assetCode.replace(/^PRL\s*/, '')}` : '',
        serialNumber ? `Serial ${serialNumber}` : '',
        model ? `Model ${model}` : ''
      ].filter(Boolean);
      setOcrResult(card, found.length ? found.join(' / ') : 'No PRL or serial detected. Try a closer, sharper photo.', !found.length);
      setStatus(found.length ? 'OCR applied.' : 'OCR finished with no detected PRL or serial.', !found.length);
      saveDraft();
    } catch (error) {
      setOcrResult(card, error.message || String(error), true);
      setStatus(error.message || String(error), true);
    } finally {
      button.disabled = false;
    }
  }

  function addDevice(values) {
    const fragment = deviceTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.device-card');
    devicesEl.appendChild(fragment);

    const data = { ...defaultDevice, ...(values || {}) };
    for (const field of deviceFields) {
      const input = card.querySelector(`[data-field="${field}"]`);
      if (input && data[field] !== undefined) {
        input.value = data[field];
      }
    }

    renumberDevices();
    saveDraft();
    return card;
  }

  function applyQuickPaste(card) {
    const input = card.querySelector('[data-field="quickPaste"]');
    const lines = (input?.value || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      setStatus('Quick paste is empty.', true);
      return;
    }

    setDeviceField(card, 'assetCode', lines[0]);
    setDeviceField(card, 'serialNumber', lines[1]);
    setDeviceField(card, 'config', lines[2]);
    setDeviceField(card, 'manufactureDate', lines[3]);
    input.value = '';
    saveDraft();
    setStatus('Quick paste applied.');
  }

  function renumberDevices() {
    const cards = getDeviceCards();
    cards.forEach((card, index) => {
      card.querySelector('[data-device-number]').textContent = String(index + 1);
      card.querySelector('[data-remove-device]').disabled = cards.length === 1;
    });
  }

  function getDeviceCards() {
    return Array.from(devicesEl.querySelectorAll('.device-card'));
  }

  function getFormData() {
    const data = {};
    for (const field of topFields) {
      data[field] = (form.elements[field]?.value || '').trim();
    }

    data.devices = getDeviceCards().map((card) => {
      const device = {};
      for (const field of deviceFields) {
        const input = card.querySelector(`[data-field="${field}"]`);
        device[field] = (input?.value || '').trim();
      }
      return device;
    });

    return data;
  }

  function saveDraft() {
    const data = getFormData();
    localStorage.setItem(draftKey, JSON.stringify(data));
  }

  function loadDraft() {
    form.elements.templateType.value = 'bbdgSr';
    form.elements.date.value = todayInputValue();
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) {
        addDevice();
        return;
      }

      const data = JSON.parse(raw);
      for (const field of topFields) {
        if (data[field] !== undefined && form.elements[field]) {
          form.elements[field].value = data[field];
        }
      }
      form.elements.templateType.value = 'bbdgSr';

      if (!form.elements.date.value) {
        form.elements.date.value = todayInputValue();
      }

      const devices = Array.isArray(data.devices) && data.devices.length ? data.devices : [defaultDevice];
      devices.forEach((device) => addDevice(device));
    } catch {
      localStorage.removeItem(draftKey);
      addDevice();
    }
  }

  function updateTemplateMode() {
    const templateType = form.elements.templateType.value;
    const isBbdgSr = templateType === 'bbdgSr';
    document.querySelectorAll('[data-bbdg-sr-only]').forEach((el) => {
      el.hidden = !isBbdgSr;
    });
    document.querySelectorAll('[data-tcb-only]').forEach((el) => {
      el.hidden = isBbdgSr;
      el.querySelectorAll('input, select, textarea').forEach((input) => {
        input.required = !isBbdgSr && input.dataset.originalRequired === 'true';
      });
    });
    if (isBbdgSr) {
      if (form.elements.employeeId) form.elements.employeeId.required = false;
      if (form.elements.phone) form.elements.phone.required = false;
    } else if (form.elements.employeeId && form.elements.phone) {
      form.elements.employeeId.required = true;
      form.elements.phone.required = true;
    }
  }

  function renderImages(card) {
    const input = card.querySelector('[data-field="images"]');
    const list = card.querySelector('[data-image-list]');
    const files = Array.from(input.files || []);
    list.innerHTML = '';
    for (const file of files) {
      const item = document.createElement('div');
      item.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
      list.appendChild(item);
    }
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function parseLocalDate(dateValue) {
    const [year, month, day] = dateValue.split('-').map(Number);
    return { year, month, day };
  }

  function filenameDate(dateValue) {
    const { year, month, day } = parseLocalDate(dateValue);
    return `${year}${pad2(month)}${pad2(day)}`;
  }

  function vietnameseDateLine(city, dateValue) {
    const { year, month, day } = parseLocalDate(dateValue);
    return `${city}, ngày ${pad2(day)} tháng ${pad2(month)} năm ${year}`;
  }

  function sanitizeTicketId(ticketId) {
    return ticketId.replace(/[^A-Za-z0-9_-]/g, '');
  }

  function normalizedTicketId(data) {
    const ticketId = sanitizeTicketId(data.ticketId);
    if (data.templateType !== 'bbdgSr') return ticketId;
    return ticketId.toUpperCase().startsWith('SR-') ? ticketId : `SR-${ticketId}`;
  }

  function filenameTicketId(data) {
    const ticketId = normalizedTicketId(data);
    if (data.templateType !== 'bbdgSr') return ticketId;
    return ticketId.toUpperCase().startsWith('SR-') ? ticketId.slice(3) : ticketId;
  }

  function sanitizeFolderName(value, fallback) {
    const cleaned = (value || '').replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return cleaned || fallback;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setCell(sheet, address, value) {
    sheet.getCell(address).value = value || '';
  }

  function copyRowStyle(sourceRow, targetRow) {
    targetRow.height = sourceRow.height;
    sourceRow.eachCell({ includeEmpty: true }, (sourceCell, colNumber) => {
      const targetCell = targetRow.getCell(colNumber);
      targetCell.style = JSON.parse(JSON.stringify(sourceCell.style || {}));
      targetCell.numFmt = sourceCell.numFmt;
      targetCell.alignment = sourceCell.alignment ? { ...sourceCell.alignment } : undefined;
      targetCell.border = sourceCell.border ? JSON.parse(JSON.stringify(sourceCell.border)) : undefined;
      targetCell.fill = sourceCell.fill ? JSON.parse(JSON.stringify(sourceCell.fill)) : undefined;
      targetCell.font = sourceCell.font ? JSON.parse(JSON.stringify(sourceCell.font)) : undefined;
    });
  }

  function prepareDeviceRows(sheet, deviceCount) {
    const count = Math.max(1, deviceCount);
    if (count > 1) {
      sheet.spliceRows(18, 0, ...Array.from({ length: count - 1 }, () => []));
      const templateRow = sheet.getRow(17);
      for (let rowNumber = 18; rowNumber < 17 + count; rowNumber += 1) {
        copyRowStyle(templateRow, sheet.getRow(rowNumber));
      }
    }
  }

  function writeDevice(sheet, rowNumber, index, person, device) {
    setCell(sheet, `A${rowNumber}`, String(index + 1));
    setCell(sheet, `B${rowNumber}`, device.userName || person.representativeName);
    setCell(sheet, `C${rowNumber}`, person.employeeId);
    setCell(sheet, `D${rowNumber}`, device.assetCode);
    setCell(sheet, `E${rowNumber}`, device.assetName);
    setCell(sheet, `F${rowNumber}`, device.mainboard);
    setCell(sheet, `G${rowNumber}`, device.chip);
    setCell(sheet, `H${rowNumber}`, device.ram);
    setCell(sheet, `I${rowNumber}`, device.hardDrive);
    setCell(sheet, `J${rowNumber}`, device.keyboard);
    setCell(sheet, `K${rowNumber}`, device.mouse);
    setCell(sheet, `L${rowNumber}`, device.adapter);
    setCell(sheet, `M${rowNumber}`, device.battery);
    setCell(sheet, `N${rowNumber}`, device.otherParts);
    setCell(sheet, `O${rowNumber}`, device.dataStatus);
    setCell(sheet, `P${rowNumber}`, device.deviceCondition);
    setCell(sheet, `Q${rowNumber}`, device.remedy);
  }

  async function buildTcbWorkbook(workbook, data) {
    const sheet = workbook.getWorksheet('KHƯƠNG 1') || workbook.worksheets[1];
    if (!sheet) {
      throw new Error('Cannot find the Techcombank form worksheet.');
    }

    setCell(sheet, 'A8', vietnameseDateLine(data.city, data.date));
    setCell(sheet, 'A10', `Đại diện đơn vị ${data.unitName}`);
    setCell(sheet, 'A11', `Ông/bà: ${data.representativeName || data.devices[0]?.userName || ''}`);
    setCell(sheet, 'C11', 'Email: ');
    setCell(sheet, 'A12', `ID nhân sự: ${data.employeeId}`);
    setCell(sheet, 'C12', `Điện thoại: ${data.phone}`);
    setCell(sheet, 'B13', data.address);

    prepareDeviceRows(sheet, data.devices.length);
    data.devices.forEach((device, index) => {
      writeDevice(sheet, 17 + index, index, data, device);
    });

    const reportRow = 20 + Math.max(0, data.devices.length - 1);
    const reportText = data.devices
      .map((device, index) => device.userSuggestion ? `${index + 1}. ${device.userSuggestion}` : '')
      .filter(Boolean)
      .join('\n');
    setCell(sheet, `A${reportRow}`, reportText);
  }

  function writeBbdgDevice(sheet, rowNumber, index, data, device) {
    setCell(sheet, `A${rowNumber}`, String(index + 1));
    setCell(sheet, `B${rowNumber}`, device.userName || '');
    setCell(sheet, `C${rowNumber}`, device.deviceType);
    setCell(sheet, `D${rowNumber}`, device.model || device.assetName);
    setCell(sheet, `E${rowNumber}`, device.assetCode);
    setCell(sheet, `F${rowNumber}`, device.serialNumber);
    setCell(sheet, `G${rowNumber}`, device.manufactureDate);
    setCell(sheet, `H${rowNumber}`, device.config || [
      device.assetName,
      device.chip,
      device.ram,
      device.hardDrive
    ].filter(Boolean).join(', '));
    setCell(sheet, `I${rowNumber}`, device.deviceCondition);
    setCell(sheet, `J${rowNumber}`, device.userSuggestion);
    setCell(sheet, `K${rowNumber}`, device.itProposal);
    setCell(sheet, `L${rowNumber}`, device.itAssessment);
    setCell(sheet, `M${rowNumber}`, device.note);
    setCell(sheet, `N${rowNumber}`, normalizedTicketId(data));
  }

  function findBbdgDateRow(sheet) {
    for (let rowNumber = 10; rowNumber <= 25; rowNumber += 1) {
      const value = String(sheet.getCell(`I${rowNumber}`).value || '');
      if (value.includes('Ngày đánh giá')) return rowNumber;
    }
    return 15;
  }

  function clearBbdgUnusedDeviceRows(sheet, firstUnusedRow, dateRow) {
    for (let rowNumber = firstUnusedRow; rowNumber < dateRow; rowNumber += 1) {
      for (let colNumber = 1; colNumber <= 14; colNumber += 1) {
        sheet.getRow(rowNumber).getCell(colNumber).value = '';
      }
    }
  }

  function normalizeBbdgSignatureRows(sheet, dateRow) {
    const signatureRow = dateRow + 1;
    setCell(sheet, `A${signatureRow}`, 'IT đánh giá trực tiếp');
    setCell(sheet, `F${signatureRow}`, 'Người sử dụng');
    setCell(sheet, `L${signatureRow}`, 'Đánh giá của IT-Office');
  }

  async function buildBbdgWorkbook(workbook, data) {
    const sheet = workbook.getWorksheet('Sheet1') || workbook.worksheets[0];
    if (!sheet) {
      throw new Error('Cannot find the BBDG-SR form worksheet.');
    }
    workbook.worksheets.forEach((worksheet) => {
      worksheet.conditionalFormattings = [];
      if (worksheet.model) worksheet.model.conditionalFormattings = [];
    });

    setCell(sheet, 'A6', `Đơn vị: ${data.unitName}`);
    setCell(sheet, 'A7', `Địa chỉ: ${data.address}`);

    const count = Math.max(1, data.devices.length);
    if (count > 1) {
      sheet.spliceRows(11, 0, ...Array.from({ length: count - 1 }, () => []));
      const templateRow = sheet.getRow(10);
      for (let rowNumber = 11; rowNumber < 10 + count; rowNumber += 1) {
        copyRowStyle(templateRow, sheet.getRow(rowNumber));
      }
    }

    data.devices.forEach((device, index) => {
      writeBbdgDevice(sheet, 10 + index, index, data, device);
    });

    const dateRow = findBbdgDateRow(sheet);
    clearBbdgUnusedDeviceRows(sheet, 10 + count, dateRow);
    setCell(sheet, `I${dateRow}`, `Ngày đánh giá: ${formatSlashDate(data.date)}`);
    normalizeBbdgSignatureRows(sheet, dateRow);
  }

  function formatSlashDate(dateValue) {
    const { year, month, day } = parseLocalDate(dateValue);
    return `${pad2(day)}/${pad2(month)}/${year}`;
  }

  async function buildWorkbook(data) {
    const workbook = new ExcelJS.Workbook();
    const templateType = data.templateType || 'tcb';
    const template = window.ITSM_TEMPLATES?.[templateType] || window.ITSM_TEMPLATE_BASE64;
    await workbook.xlsx.load(base64ToArrayBuffer(template));

    if (templateType === 'bbdgSr') {
      await buildBbdgWorkbook(workbook, data);
    } else {
      await buildTcbWorkbook(workbook, data);
    }

    return workbook.xlsx.writeBuffer();
  }

  async function generateZip(data) {
    const ticketId = sanitizeTicketId(data.ticketId);
    if (!ticketId) {
      throw new Error('Ticket ID must contain at least one letter or number.');
    }
    if (!data.devices.length) {
      throw new Error('Add at least one device.');
    }

    const workbookBuffer = await buildWorkbook(data);
    const prefix = data.templateType === 'bbdgSr' ? 'BBDG-SR' : 'BBDG_ITSM';
    const baseName = `${prefix}-${filenameTicketId(data)}_${filenameDate(data.date)}`;
    const zip = new JSZip();
    zip.file(`${baseName}.xlsx`, workbookBuffer);

    getDeviceCards().forEach((card, index) => {
      const dataForDevice = data.devices[index] || {};
      const folder = `images/device-${pad2(index + 1)}-${sanitizeFolderName(dataForDevice.assetCode, 'asset')}/`;
      const files = Array.from(card.querySelector('[data-field="images"]').files || []);
      for (const file of files) {
        zip.file(`${folder}${file.name}`, file);
      }
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `${baseName}.zip`);
  }

  form.addEventListener('input', saveDraft);
  form.elements.templateType.addEventListener('change', () => {
    updateTemplateMode();
    saveDraft();
  });

  devicesEl.addEventListener('change', (event) => {
    const card = event.target.closest('.device-card');
    if (card && event.target.matches('[data-field="images"]')) {
      renderImages(card);
    }
  });

  devicesEl.addEventListener('click', (event) => {
    const ocr = event.target.closest('[data-run-ocr]');
    if (ocr) {
      runDeviceOcr(ocr.closest('.device-card'));
      return;
    }

    const quickPaste = event.target.closest('[data-apply-quick-paste]');
    if (quickPaste) {
      applyQuickPaste(quickPaste.closest('.device-card'));
      return;
    }

    const preset = event.target.closest('[data-config-preset]');
    if (preset) {
      const card = preset.closest('.device-card');
      setDeviceField(card, 'config', preset.dataset.configPreset);
      saveDraft();
      setStatus('Config preset applied.');
      return;
    }

    const custom = event.target.closest('[data-config-custom]');
    if (custom) {
      custom.closest('.device-card')?.querySelector('[data-field="config"]')?.focus();
      return;
    }

    const remove = event.target.closest('[data-remove-device]');
    if (!remove) return;
    const cards = getDeviceCards();
    if (cards.length <= 1) return;
    remove.closest('.device-card').remove();
    renumberDevices();
    saveDraft();
  });

  addDeviceButton.addEventListener('click', () => {
    addDevice();
  });

  resetButton.addEventListener('click', () => {
    localStorage.removeItem(draftKey);
    form.reset();
    devicesEl.innerHTML = '';
    form.elements.templateType.value = 'bbdgSr';
    form.elements.date.value = todayInputValue();
    addDevice();
    setStatus('Draft cleared.');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    generateButton.disabled = true;
    setStatus('Generating ZIP...');
    try {
      await generateZip(getFormData());
      setStatus('ZIP generated.');
    } catch (error) {
      setStatus(error.message || String(error), true);
    } finally {
      generateButton.disabled = false;
    }
  });

  loadDraft();
  document.querySelectorAll('[required]').forEach((input) => {
    input.dataset.originalRequired = 'true';
  });
  updateTemplateMode();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then((registration) => registration.update()).catch(() => {});
  }
}());
