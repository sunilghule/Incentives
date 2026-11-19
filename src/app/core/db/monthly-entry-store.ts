import { MangoQuerySelector, RxCollection } from 'rxdb';

/** Read/write helper for collections whose documents are grouped by working month. */
export class MonthlyEntryStore<T extends { id: string; month: string }> {
    constructor(private readonly collection: () => RxCollection<T>) { }

    async byMonth(month: string): Promise<T[]> {
        const docs = await this.collection()
            .find({ selector: { month } as MangoQuerySelector<T> })
            .exec();

        return docs.map(doc => doc.toMutableJSON() as T);
    }

    async save(doc: T): Promise<void> {
        await this.collection().upsert(doc);
    }

    async saveMany(docs: T[]): Promise<void> {
        if (docs.length > 0) {
            await this.collection().bulkUpsert(docs);
        }
    }

    async remove(id: string): Promise<void> {
        await this.collection().findOne(id).remove();
    }
}
