export interface Product {
    id: string;
    model: string;
    variant: string;
    type: ProductType;
    productLine?: string;
    engine: string;
    transmission: string;
    /** Legacy seed data only; not persisted or displayed. */
    category?: string;
}

export enum ProductType {
    PETROL = 1,
    DIESEL = 2,
    ELECTRIC = 3,
    CNG = 4,
    HYBRID = 5
}

export enum Models {
    Tiago = "Tiago",
    Nexon = "Nexon",
    Altroz = "Altroz",
    Punch = "Punch",
    Tigor = "Tigor",
    Harrier = "Harrier",
    Safari = "Safari",
    Curvv = "Curvv",
    Sierra = "Sierra"
}

export type ModelVariantMap = {
    [key in Models]: string[];
};

export const modelVariants: ModelVariantMap = {
    [Models.Tiago]: ["XE", "XM", "XT", "XZ"],
    [Models.Nexon]: ["Smart", "Smart Plus", "Smart Plus Dual Tone", "Super"],
    [Models.Altroz]: ["XE", "XM", "XT", "XZ"],
    [Models.Punch]: ["Pure", "Pure Plus", "Adventure", "Adventure Plus"],
    [Models.Tigor]: ["XE", "XM", "XT", "XZ Plus"],
    [Models.Harrier]: ["XE", "XM", "XT", "XZ"],
    [Models.Safari]: ["XE", "XM", "XT", "XZ Plus"],
    [Models.Curvv]: ["Smart", "Smart Plus", "Super", "Super Plus"],
    [Models.Sierra]: ["Pure", "Pure Plus", "Adventure", "Adventure Plus"],
};