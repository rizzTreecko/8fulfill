# 8fulfill

Static browser app for generating BBDG Excel assessment ZIP files.

## Use

Open the published site, choose **BBDG-SR** or **ITSM bank**, fill the form header, add one or more device rows, attach evidence images if needed, then click **Generate ZIP**.

**ITSM bank** uses the `BBDG_ITSM` workbook layout and shows additional user fields: representative/user name, employee ID, phone, region, and detailed hardware fields for the A-Q asset table.

Each device has **Offline autofill**. Paste labeled text from a handover note, device label, or inventory list, then click **Autofill device**.

```text
PRL 1223444
Serial: SNABC123456
Model: Dell Latitude 5420
CPU Core i5/Ram DDR4 8GB 3200/SSD NVME 512GB
17/05/2026
```

Autofill runs entirely in the browser using local parsing rules. It does not call AI, OCR, Google, server endpoints, or third-party services. It supports labeled fields such as asset code, serial, model, device type, user, configuration, manufacture date, condition, proposals, and note. The old four-line order still works as a fallback.

The configuration preset buttons only set field **H. Cấu hình thiết bị**. **Custom** leaves the value unchanged and focuses the field for manual entry.

Each device can include multiple evidence images. Select one or more images, then select more later if needed; the app appends them to that device's image list.


## Autosave

The app saves form text to `localStorage` whenever the form changes and restores it on the next visit. **Clear saved draft** deletes only this local browser draft. File uploads are not persisted by the browser.

## Security

Ticket data stays in the browser. The app does not send form data, generated files, or images to AI services or third-party APIs. Do not add production console logging for ticket details or credentials.

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
