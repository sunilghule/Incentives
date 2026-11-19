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
    newProduct: Product = { id: '', model: '', variant: '', type: ProductType.PETROL, category: '', engine: '', transmission: '' };
    editIndex: number | null = null;
    editProduct: Product = { id: '', model: '', variant: '', type: ProductType.PETROL, category: '', engine: '', transmission: '' };
    filterModel: { model: string; variant: string; type: ProductType | null; category: string } = {
        model: '',
        variant: '',
        type: null,
        category: ''
    };

    ngOnInit(): void {
        this.database.db.products.find().$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(docs => {
                this.products = docs.map(doc => {
                    const data = doc.toMutableJSON();
                    return { ...data, type: data.type as ProductType };
                });
                // RxDB emits outside Angular's zone, so refresh the view explicitly.
                this.changeDetectorRef.detectChanges();
            });
    }

    clearFilters(): void {
        this.filterModel = {
            model: '',
            variant: '',
            type: null,
            category: ''
        };
    }

    addNewProduct() {
        if (!this.newProduct.model || !this.newProduct.variant || !this.newProduct.type) return;
        this.saveProduct({ ...this.newProduct, id: crypto.randomUUID() });
        this.newProduct = { id: '', model: '', variant: '', type: ProductType.PETROL, category: '', engine: '', transmission: '' };
    }

    edit(idx: number) {
        this.editIndex = idx;
        this.editProduct = { ...this.products[idx] };
    }

    update(idx: number) {
        if (!this.editProduct.model || !this.editProduct.variant || !this.editProduct.type) return;
        this.products[idx] = { ...this.editProduct };
        this.saveProduct(this.products[idx]);
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
        this.database.db.products.upsert({ ...product, id, type: Number(product.type) })
            .catch(error => console.error('Unable to save product:', error));
    }

    cancelEdit() {
        this.editIndex = null;
        this.editProduct = { id: '', model: '', variant: '', type: ProductType.PETROL, category: '', engine: '', transmission: '' };
    }

    get filteredProducts() {
        return this.products.filter(product =>
            (!this.filterModel.model ||
                product.model?.toLowerCase().includes(this.filterModel.model.toLowerCase())) &&

            (!this.filterModel.variant ||
                product.variant?.toLowerCase().includes(this.filterModel.variant.toLowerCase())) &&

            (this.filterModel.type === null ||
                product.type === this.filterModel.type) &&

            (!this.filterModel.category ||
                product.category?.toLowerCase().includes(this.filterModel.category.toLowerCase()))
        );
    }
}
