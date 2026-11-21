import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product, ProductType } from '../core/models/product.model';
import { DatabaseService } from '../core/db/database.service';

@Component({
    selector: 'app-products-entry',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './products-entry.component.html',
    styleUrls: ['./products-entry.component.scss']
})
export class ProductsEntryComponent implements OnInit {
    private readonly database = inject(DatabaseService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly changeDetectorRef = inject(ChangeDetectorRef);

    // Numeric enum: Object.values also returns the reverse-mapped names, so keep numbers only.
    productTypes = Object.values(ProductType).filter((type): type is ProductType => typeof type === 'number');
    productTypeLabels = ProductType;
    products: Product[] = [];
    newProduct: Product = this.emptyProduct();
    editIndex: number | null = null;
    editProduct: Product = this.emptyProduct();
    filterModel: { productLine: string; model: string; variant: string; type: ProductType | null } = {
        productLine: '',
        model: '',
        variant: '',
        type: null
    };

    ngOnInit(): void {
        this.database.db.products.find().$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(docs => {
                this.products = docs.map(doc => {
                    const data = doc.toMutableJSON();
                    const product = { ...data, type: data.type as ProductType };
                    return { ...product, productLine: this.createProductLine(product) };
                });
                // RxDB emits outside Angular's zone, so refresh the view explicitly.
                this.changeDetectorRef.detectChanges();
            });
    }

    clearFilters(): void {
        this.filterModel = {
            productLine: '',
            model: '',
            variant: '',
            type: null
        };
    }

    addNewProduct() {
        if (this.editIndex !== null) return;
        const product = this.emptyProduct();
        this.products.push(product);
        this.edit(this.products.length - 1);
    }

    getProductIndex(product: Product): number {
        return this.products.indexOf(product);
    }

    edit(idx: number) {
        this.editIndex = idx;
        this.editProduct = { ...this.products[idx] };
    }

    update(idx: number) {
        if (!this.editProduct.model || !this.editProduct.variant || !this.editProduct.type) return;
        const product = {
            ...this.editProduct,
            id: this.products[idx].id || crypto.randomUUID(),
            productLine: this.createProductLine(this.editProduct)
        };
        this.products[idx] = product;
        this.saveProduct(product);
        this.cancelEdit();
    }

    delete(idx: number) {
        const [removed] = this.products.splice(idx, 1);
        if (removed?.id) {
            this.database.db.products.findOne(removed.id).remove()
                .catch(error => console.error('Unable to delete product:', error));
        }
        if (this.editIndex === idx) this.cancelEdit();
    }

    private saveProduct(product: Product): void {
        const id = product.id || crypto.randomUUID();
        this.database.db.products.upsert({
            id,
            model: product.model,
            variant: product.variant,
            type: Number(product.type),
            category: product.category ?? '',
            engine: product.engine,
            transmission: product.transmission
        })
            .catch(error => console.error('Unable to save product:', error));
    }

    cancelEdit() {
        if (this.editIndex !== null && !this.products[this.editIndex]?.id) {
            this.products.splice(this.editIndex, 1);
        }
        this.editIndex = null;
        this.editProduct = this.emptyProduct();
    }

    get filteredProducts() {
        return this.products.filter(product =>
            (!this.filterModel.productLine ||
                (product.productLine ?? this.createProductLine(product)).toLowerCase()
                    .includes(this.filterModel.productLine.toLowerCase())) &&

            (!this.filterModel.model ||
                product.model?.toLowerCase().includes(this.filterModel.model.toLowerCase())) &&

            (!this.filterModel.variant ||
                product.variant?.toLowerCase().includes(this.filterModel.variant.toLowerCase())) &&

            (this.filterModel.type === null ||
                product.type === this.filterModel.type)
        );
    }

    createProductLine(product: Product): string {
        return [
            product.model,
            product.variant,
            this.productTypeLabels[product.type],
            product.engine,
            product.transmission
        ].map(value => String(value ?? '').trim()).filter(Boolean).join(' ');
    }

    private emptyProduct(): Product {
        return { id: '', model: '', variant: '', type: ProductType.PETROL, productLine: '', engine: '', transmission: '' };
    }
}
