import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Token } from './entities/Token';

export const AppDataSource = new DataSource({
    type: 'sqlite',
    database: 'pump_scraper.db',
    synchronize: true,
    logging: false,
    entities: [Token],
});

export async function getDataSource(): Promise<DataSource> {
    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
    }
    return AppDataSource;
}
