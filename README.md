# 8fulfill

Static browser app for generating BBDG Excel assessment ZIP files.

## Use

Open the published site, fill the form header, add one or more device rows, attach evidence images if needed, then click **Generate ZIP**.

Each device has **Quick paste** for four lines in this order:

```text
PRL 1223444
SNABC123456
CPU Core i5/Ram DDR4 8GB 3200/SSD NVME 512GB
17/05/2026
```

Click **Apply quick paste** to fill that device's asset code, serial number, configuration, and manufacture date. Blank or missing lines are ignored, so a two-line paste only updates asset code and serial.

The configuration preset buttons only set field **H. Cấu hình thiết bị**. **Custom** leaves the value unchanged and focuses the field for manual entry.

Each device also has **OCR PRL / Serial**. Choose a clear photo of the device label and click **Scan PRL + serial**. OCR runs locally in the browser and tries to fill:

- `E. Mã tài sản`
- `F. Serial number`
- `D. Model thiết bị`, when the label text includes a model/product name near the serial number

The OCR helper does not call an external lookup API. If a model is not printed clearly in the photo, the model field stays unchanged.

## Autosave

The app saves form text to `localStorage` whenever the form changes and restores it on the next visit. **Clear saved draft** deletes only this local browser draft. File uploads are not persisted by the browser.

## Security

Ticket data stays in the browser. The app does not send form data, generated files, OCR photos, or images to AI services or third-party APIs. Do not add production console logging for ticket details or credentials.

## Local Run

```powershell
npx serve .
```

Then open the local URL shown by `serve`.

## Deployment

This project is a static site and can be deployed directly to Vercel.

```powershell
npx vercel --prod
```
