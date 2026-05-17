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
    'representativeName', 'employeeId', 'phone', 'address'
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

  function normalizeForMatch(value) {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  function stripLabel(line) {
    return line.replace(/^\s*[^:：=]{1,36}\s*[:：=]\s*/, '').trim();
  }

  function labeledValue(lines, aliases) {
    for (const line of lines) {
      const normalized = normalizeForMatch(line);
      const separator = line.match(/[:：=]/);
      if (!separator) continue;
      const label = normalizeForMatch(line.slice(0, separator.index));
      if (aliases.some((alias) => label.includes(alias))) {
        const value = stripLabel(line);
        if (value) return value;
      }
    }
    return '';
  }

  function normalizeAssetCode(value) {
    const text = (value || '').toUpperCase();
    const hasPrl = /\bPRL\b/.test(text);
    const match = text.match(/\b(?:PRL\s*[-:]?\s*)?([A-Z0-9]{5,16})\b/);
    if (!match) return '';
    const token = match[1].replace(/[OQD]/g, '0').replace(/[IL]/g, '1');
    const digits = token.replace(/[^0-9]/g, '');
    if (!/\d{5,}/.test(digits)) return '';
    return hasPrl ? `PRL ${digits}` : digits;
  }

  function normalizeSerial(value) {
    const cleaned = (value || '')
      .toUpperCase()
      .replace(/\b(?:SERIAL|S\/N|SN|SERVICE TAG|TAG|NO|NUMBER)\b\s*[:：=.-]?\s*/g, '')
      .replace(/[^A-Z0-9-]/g, '')
      .replace(/^-+|-+$/g, '');
    if (cleaned.length < 5 || cleaned.length > 30) return '';
    if (/^PRL/.test(cleaned) || /^20\d{2}$/.test(cleaned)) return '';
    return cleaned;
  }

  function normalizeSlashDate(value) {
    const text = value || '';
    const slash = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
    if (slash) {
      const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
      return `${pad2(slash[1])}/${pad2(slash[2])}/${year}`;
    }
    const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    return iso ? `${pad2(iso[3])}/${pad2(iso[2])}/${iso[1]}` : '';
  }

  function inferDeviceType(value) {
    const text = normalizeForMatch(value);
    if (/\b(laptop|notebook|latitude|inspiron|vostro|elitebook|probook|thinkpad|ideapad|xps)\b/.test(text)) return 'Laptop';
    if (/\b(desktop|pc|optiplex|thinkcentre|elitedesk|prodesk|may tinh ban)\b/.test(text)) return 'Desktop';
    if (/\b(monitor|man hinh|display)\b/.test(text)) return 'Màn hình';
    if (/\b(printer|may in|laserjet|canon|brother)\b/.test(text)) return 'Máy in';
    if (/\b(scanner|may scan)\b/.test(text)) return 'Máy scan';
    if (/\b(ups)\b/.test(text)) return 'UPS';
    if (/\b(ipphone|ip phone)\b/.test(text)) return 'IPPhone';
    if (/\b(switch)\b/.test(text)) return 'Switch';
    if (/\b(router)\b/.test(text)) return 'Router';
    if (/\b(server)\b/.test(text)) return 'Server';
    if (/\b(projector|may chieu)\b/.test(text)) return 'Máy chiếu';
    return '';
  }

  function looksLikeConfig(line) {
    return /\b(cpu|core\s*i[3579]|ram|ddr|ssd|hdd|nvme|sata|gb|tb|storage)\b/i.test(line);
  }

  function looksLikeModel(line) {
    return /\b(dell|hp|lenovo|thinkpad|latitude|inspiron|vostro|optiplex|elitebook|probook|thinkcentre|canon|brother|laserjet)\b/i.test(line);
  }

  function parseOfflineAutofill(rawText) {
    const lines = (rawText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const joined = lines.join('\n');

    const assetFromLabel = labeledValue(lines, ['asset', 'asset code', 'ma tai san', 'ma ts', 'prl']);
    const serialFromLabel = labeledValue(lines, ['serial', 'serial number', 'service tag', 's/n', 'sn']);
    const modelFromLabel = labeledValue(lines, ['model', 'product', 'product name', 'device name', 'ten thiet bi']);
    const typeFromLabel = labeledValue(lines, ['type', 'loai thiet bi', 'device type']);
    const configFromLabel = labeledValue(lines, ['config', 'configuration', 'cau hinh']);
    const dateFromLabel = labeledValue(lines, ['date', 'ngay xuat xuong', 'manufacture', 'mfg']);

    const assetCode = normalizeAssetCode(assetFromLabel || (joined.match(/\bPRL\s*[-:]?\s*[A-Z0-9]{5,16}\b/i) || [''])[0] || lines[0]);
    const serialNumber = normalizeSerial(serialFromLabel || (joined.match(/\b(?:S\/N|SN|SERIAL|SERVICE TAG)\s*[:：=.-]?\s*[A-Z0-9-]{5,30}\b/i) || [''])[0] || lines[1]);
    const manufactureDate = normalizeSlashDate(dateFromLabel || joined);
    const config = configFromLabel || lines.find(looksLikeConfig) || (!looksLikeConfig(lines[2] || '') ? '' : lines[2]);
    const model = modelFromLabel || lines.find((line) => looksLikeModel(line) && line !== config) || '';
    const userName = labeledValue(lines, ['user', 'nsd', 'nguoi su dung', 'ho ten']);
    const assetName = labeledValue(lines, ['asset name', 'ten tai san', 'device', 'thiet bi']);
    const chip = labeledValue(lines, ['chip', 'cpu', 'processor']);
    const ram = labeledValue(lines, ['ram', 'memory']);
    const hardDrive = labeledValue(lines, ['storage', 'disk', 'hard drive', 'hdd', 'ssd', 'o cung']);
    const note = labeledValue(lines, ['note', 'ghi chu']);
    const deviceCondition = labeledValue(lines, ['condition', 'tinh trang']);
    const userSuggestion = labeledValue(lines, ['suggestion', 'de xuat nguoi dung', 'de xuat nsd']);
    const itProposal = labeledValue(lines, ['it proposal', 'de xuat it']);
    const deviceType = inferDeviceType(typeFromLabel || model || config || joined);

    return {
      userName,
      deviceType,
      model,
      assetName,
      assetCode,
      serialNumber,
      manufactureDate,
      config,
      chip,
      ram,
      hardDrive,
      deviceCondition,
      userSuggestion,
      itProposal,
      note
    };
  }

  const imageFilesByCard = new WeakMap();

  function fileKey(file) {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  function getImageFiles(card) {
    return imageFilesByCard.get(card) || [];
  }

  function addImageFiles(card, files) {
    const existing = getImageFiles(card);
    const keys = new Set(existing.map(fileKey));
    const next = [...existing];
    for (const file of files) {
      if (!file.type.startsWith('image/') || keys.has(fileKey(file))) continue;
      keys.add(fileKey(file));
      next.push(file);
    }
    imageFilesByCard.set(card, next);
    return next;
  }

  function removeImageFile(card, index) {
    const next = getImageFiles(card).filter((_, fileIndex) => fileIndex !== index);
    imageFilesByCard.set(card, next);
    return next;
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
    const rawText = input?.value || '';

    if (!rawText.trim()) {
      setStatus('Offline autofill is empty.', true);
      return;
    }

    const parsed = parseOfflineAutofill(rawText);
    const applied = [];
    for (const [field, value] of Object.entries(parsed)) {
      if (!value) continue;
      setDeviceField(card, field, value);
      applied.push(field);
    }

    if (!applied.length) {
      setStatus('No supported asset fields found in the pasted text.', true);
      return;
    }

    input.value = '';
    saveDraft();
    setStatus(`Offline autofill applied ${applied.length} field${applied.length === 1 ? '' : 's'}.`);
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
    form.elements.city.value = 'HCM';
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
      if (!form.elements.templateType.value) {
        form.elements.templateType.value = 'bbdgSr';
      }
      if (!form.elements.city.value) {
        form.elements.city.value = 'HCM';
      }

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
      if (form.elements.representativeName) form.elements.representativeName.required = false;
      if (form.elements.employeeId) form.elements.employeeId.required = false;
      if (form.elements.phone) form.elements.phone.required = false;
    } else {
      if (form.elements.representativeName) form.elements.representativeName.required = true;
      if (form.elements.employeeId) form.elements.employeeId.required = true;
      if (form.elements.phone) form.elements.phone.required = true;
    }
  }

  function renderImages(card) {
    const list = card.querySelector('[data-image-list]');
    const files = getImageFiles(card);
    list.innerHTML = '';
    files.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-list-item';
      const name = document.createElement('span');
      name.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-image';
      remove.dataset.removeImage = String(index);
      remove.textContent = 'Remove';
      item.append(name, remove);
      list.appendChild(item);
    });
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

  function hardwareFromConfig(config) {
    const parts = String(config || '').split(/[\/,;|]+/).map((part) => part.trim()).filter(Boolean);
    const find = (pattern) => parts.find((part) => pattern.test(part)) || '';
    return {
      chip: find(/\b(cpu|core\s*i[3579]|xeon|ryzen|celeron|pentium)\b/i),
      ram: find(/\b(ram|ddr|memory)\b/i),
      hardDrive: find(/\b(ssd|hdd|nvme|sata|storage|tb|gb)\b/i)
    };
  }

  function writeDevice(sheet, rowNumber, index, person, device) {
    const inferred = hardwareFromConfig(device.config);
    setCell(sheet, `A${rowNumber}`, String(index + 1));
    setCell(sheet, `B${rowNumber}`, device.userName || person.representativeName);
    setCell(sheet, `C${rowNumber}`, person.employeeId);
    setCell(sheet, `D${rowNumber}`, device.assetCode);
    setCell(sheet, `E${rowNumber}`, device.assetName || device.model || device.deviceType);
    setCell(sheet, `F${rowNumber}`, device.mainboard);
    setCell(sheet, `G${rowNumber}`, device.chip || inferred.chip);
    setCell(sheet, `H${rowNumber}`, device.ram || inferred.ram);
    setCell(sheet, `I${rowNumber}`, device.hardDrive || inferred.hardDrive);
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
      const files = getImageFiles(card);
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
      addImageFiles(card, Array.from(event.target.files || []));
      event.target.value = '';
      renderImages(card);
    }
  });

  devicesEl.addEventListener('click', (event) => {
    const removeImage = event.target.closest('[data-remove-image]');
    if (removeImage) {
      const card = removeImage.closest('.device-card');
      removeImageFile(card, Number(removeImage.dataset.removeImage));
      renderImages(card);
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
    form.elements.city.value = 'HCM';
    form.elements.date.value = todayInputValue();
    addDevice();
    updateTemplateMode();
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
