// Model for Sales Entry as per provided headers
export interface SalesEntry {
    id: string;                  // Unique identifier
    invoiceDate: string;         // Invoice Date
    stockDate: string;           // Stock Date
    invoiceNumber: string;       // Invoice Number
    chassisNo: string;           // Chassis No
    engineNo: string;            // Engine No.
    product: string;             // Model
    ca: string;                  // ca
    tl: string;                  // tl
    location: string;            // location
    sm: string;                  // sm
    tmInvoiceDate: string;       // TM Invoice Date
    stockAgeing: string;         // Stock Ageing
    club: string;                // CLUB
    unitsSold: number;         // Number of units sold : to be remove afterwards
    carValue: number;        // Car Value : to be remove afterwards
    discountPercent: number; // Discount Percent : to be remove afterwards
    isStock: boolean;        // Is Stock : to be remove afterwards
    accessoryValue: number; // Accessory Value : to be remove afterwards
    discountAmount: number; // Discount Amount : to be remove afterwards
}