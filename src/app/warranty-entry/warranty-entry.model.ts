export interface WarrantyEntryField {
    key: string;
    label: string;
    inputType: 'text' | 'date' | 'number';
    required?: boolean;
    hidden?: boolean;
}

export interface WarrantyEntry {
    id?: string;
    values: Record<string, string>;
}