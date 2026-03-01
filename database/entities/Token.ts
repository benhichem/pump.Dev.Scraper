import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Token {
    @PrimaryColumn()
    address: string;

    @Column()
    name: string;

    @Column()
    chain: string;

    @Column()
    creator: string;

    @Column({ type: 'integer' })
    creator_time: number;

    @CreateDateColumn()
    scraped_at: Date;
}
