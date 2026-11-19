export interface AccessoryEntryField {
    key: string;
    label: string;
    inputType: 'text' | 'number';
    required?: boolean;
    hidden?: boolean;
}

export interface AccessoryEntry {
    id?: string;
    values: Record<string, string>;
}