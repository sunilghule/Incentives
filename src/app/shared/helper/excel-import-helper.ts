import * as XLSX from 'xlsx';

export class ExcelImportHelper {

  static readFile(
    file: File
  ): Promise<Record<string, unknown>[]> {

    return new Promise((resolve, reject) => {

      const reader = new FileReader();

      reader.onload = (
        event: ProgressEvent<FileReader>
      ) => {

        try {
          const arrayBuffer = event.target?.result;

          if (!(arrayBuffer instanceof ArrayBuffer)) {
            reject(
              new Error('Unable to read Excel file.')
            );
            return;
          }

          const workbook = XLSX.read(arrayBuffer, {
            type: 'array',
            cellDates: true
          });

          if (!workbook.SheetNames.length) {
            reject(
              new Error(
                'No worksheet found in the Excel file.'
              )
            );
            return;
          }

          /*
           * Use the first worksheet by default.
           *
           * The caller can decide which sheet to use
           * if required in the future.
           */
          const sheetName =
            workbook.SheetNames[0];

          const worksheet =
            workbook.Sheets[sheetName];

          const rows =
            XLSX.utils.sheet_to_json<unknown[]>(
              worksheet,
              {
                header: 1,
                defval: '',
                raw: true
              }
            );

          if (!rows.length) {
            reject(
              new Error(
                'The Excel file does not contain any data.'
              )
            );
            return;
          }

          /*
           * Treat the first row as the header row.
           */
          const headerRow =
            rows[0] as unknown[];

          const headers =
            headerRow.map(header =>
              this.normalizeHeader(
                String(header ?? '')
              )
            );

          const excelData:
            Record<string, unknown>[] = [];

          for (
            let rowIndex = 1;
            rowIndex < rows.length;
            rowIndex++
          ) {

            const row =
              rows[rowIndex] as unknown[];

            if (!Array.isArray(row)) {
              continue;
            }

            /*
             * Ignore completely empty rows.
             */
            const hasData = row.some(
              cell =>
                cell !== null &&
                cell !== undefined &&
                String(cell).trim() !== ''
            );

            if (!hasData) {
              continue;
            }

            const rowObject:
              Record<string, unknown> = {};

            headers.forEach(
              (header, columnIndex) => {

                if (!header) {
                  return;
                }

                rowObject[header] =
                  row[columnIndex] ?? '';
              }
            );

            excelData.push(rowObject);
          }

          resolve(excelData);

        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(
          new Error('Unable to read the Excel file.')
        );
      };

      reader.readAsArrayBuffer(file);
    });
  }

  private static normalizeHeader(
    header: string
  ): string {

    return header
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
}