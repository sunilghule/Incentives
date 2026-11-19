import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { Product, ProductType } from '../models/product.model';

@Injectable({
    providedIn: 'root'
})
export class ProductService {

    constructor(private readonly http: HttpClient) { }

    getProducts(): Product[] {
        const products: Product[] = [
            {
                model: "Tiago EV", variant: "XT",
                id: '1',
                type: ProductType.ELECTRIC,
                category: 'LR',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "XZA+",
                id: '2',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "XT",
                id: '3',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "XT",
                id: '4',
                type: ProductType.CNG,
                category: 'Rhythm',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "XZA+",
                id: '5',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Pure",
                id: '6',
                type: ProductType.PETROL,
                category: '',
                engine: '1.2',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Fearless",
                id: '7',
                type: ProductType.PETROL,
                category: 'S',
                engine: '',
                transmission: 'DT'
            },
            {
                model: "Nexon", variant: "Smart",
                id: '8',
                type: ProductType.PETROL,
                category: '',
                engine: '1.2',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Creative + S DT",
                id: '9',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "XZ",
                id: '10',
                type: ProductType.PETROL,
                category: '',
                engine: '1.2',
                transmission: ''
            },
            {
                model: "Altroz", variant: "XZA",
                id: '11',
                type: ProductType.PETROL,
                category: '',
                engine: '1.2',
                transmission: ''
            },
            {
                model: "Altroz", variant: "XM+",
                id: '12',
                type: ProductType.DIESEL,
                category: '',
                engine: '1.5',
                transmission: ''
            },
            {
                model: "Altroz", variant: "XZA+S",
                id: '13',
                type: ProductType.PETROL,
                category: '',
                engine: '1.2',
                transmission: ''
            },
            {
                model: "Altroz", variant: "XZ+S",
                id: '14',
                type: ProductType.DIESEL,
                category: '',
                engine: '1.5',
                transmission: ''
            },
            {
                model: "Altroz", variant: "XMA+",
                id: '15',
                type: ProductType.PETROL,
                category: '',
                engine: '1.2',
                transmission: ''
            },
            {
                model: "Altroz", variant: "XZA+S 1.2 P DK",
                id: '16',
                type: ProductType.PETROL,
                category: '',
                engine: '1.2',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Racer R3",
                id: '17',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "XZ+OS CNG",
                id: '18',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Adventure AMT",
                id: '19',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tigor", variant: "Tigor XZ CNG",
                id: '20',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch EV Empowered LR",
                id: '21',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Pure CNG",
                id: '22',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Accomplished CNG",
                id: '23',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Accomplished Dzle S CNG",
                id: '24',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Harrier", variant: "Harrier Adventure + DK (AT)",
                id: '25',
                type: ProductType.DIESEL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Safari 2.0", variant: "Safari Adventure + (AT)",
                id: '26',
                type: ProductType.DIESEL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Safari 2.0", variant: "Safari Accomplished + DT (AT)",
                id: '27',
                type: ProductType.DIESEL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch EV", variant: "Punch EV Empowered + LR",
                id: '28',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon EV 3.0", variant: "Nexon EV 3.0 Empowered 45",
                id: '29',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon EV 3.0", variant: "Nexon EV 3.0 Empowered+ 45",
                id: '30',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch EV", variant: "Punch EV Empowered LR",
                id: '31',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon EV 3.0", variant: "Nexon EV 3.0 Creative + MR",
                id: '32',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv EV", variant: "Curvv EV Empowered+ A 55",
                id: '33',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon EV 3.0", variant: "Nexon EV 3.0 Fearless 45",
                id: '34',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch EV", variant: "Punch EV Empowered + LR ACFC",
                id: '35',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch EV", variant: "Punch EV Empowered S LR",
                id: '36',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch EV", variant: "Punch EV Empowered +S LR ACFC",
                id: '37',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch EV", variant: "Punch EV Adventure",
                id: '38',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv EV", variant: "Curvv EV Accomplished 55",
                id: '39',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Smart + S CNG",
                id: '40',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Accomplished+ CNG",
                id: '41',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Adventure Rhythm CNG",
                id: '42',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Adventure+S CNG",
                id: '43',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XZ CNG",
                id: '44',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XZ+OS CNG",
                id: '45',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Adventure CNG",
                id: '46',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Accomplished+S CNG",
                id: '47',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XZA+S LUX 1.2P",
                id: '48',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + S DCA DK 1.2",
                id: '49',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Accomplished Dzle S CNG",
                id: '50',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Adventure+S CNG",
                id: '51',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + CNG",
                id: '52',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Pure S 1.2",
                id: '53',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + DT CNG",
                id: '54',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Accomplished+ AMT",
                id: '55',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + AMT DK 1.5",
                id: '56',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + S DT 1.5",
                id: '57',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative DT CNG",
                id: '58',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Pure 1.5",
                id: '59',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv", variant: "Curvv Creative 1.2",
                id: '60',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XE CNG",
                id: '61',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + DCA DT 1.2",
                id: '62',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Accomplished Dzle SR AMT",
                id: '63',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + PS DT CNG",
                id: '64',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Adventure Rhythm AMT",
                id: '65',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Smart + CNG",
                id: '66',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Safari 2.0", variant: "Safari Adventure + A (AT)",
                id: '67',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "Tiago (P) XTA",
                id: '68',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Creative+ AMT",
                id: '69',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative CNG",
                id: '70',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Fearless DT 1.5",
                id: '71',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "Tiago (P) XZA+",
                id: '72',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Pure S CNG",
                id: '73',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "Tiago (P) XT",
                id: '74',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch EV", variant: "Punch EV Adventure LR",
                id: '75',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XM+S CNG",
                id: '76',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + AMT 1.5",
                id: '77',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago EV", variant: "Tiago EV LR XZ+ Tech Lux",
                id: '78',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "Tiago XM CNG",
                id: '79',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Adventure Rhythm AMT",
                id: '80',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv EV", variant: "Curvv EV Empowered+ 55",
                id: '81',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv EV", variant: "Curvv EV Accomplished+ S 55",
                id: '82',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Adventure Rhythm",
                id: '83',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + S 1.5",
                id: '84',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + 1.5",
                id: '85',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + PS CNG",
                id: '86',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + 1.2",
                id: '87',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + DCA 1.2",
                id: '88',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XM+ 1.2 P",
                id: '89',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "Tiago XE CNG",
                id: '90',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tigor", variant: "Tigor (P) XZ+",
                id: '91',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv", variant: "Curvv Creative+S DCA 1.2",
                id: '92',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XM+ CNG",
                id: '93',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XMA+ 1.2 P",
                id: '94',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative AMT 1.2",
                id: '95',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XZA+S LUX DK 1.2P",
                id: '96',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XZ LUX CNG",
                id: '97',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Adventure S CNG",
                id: '98',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Smart + 1.5",
                id: '99',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Accomplished+",
                id: '100',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XM S 1.2 P",
                id: '101',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv", variant: "Curvv Creative 1.5",
                id: '102',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "Tiago XZ+ CNG",
                id: '103',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XM 1.2 P",
                id: '104',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv", variant: "Curvv Creative 1.2",
                id: '105',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tigor", variant: "Tigor XM CNG",
                id: '106',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tigor", variant: "Tigor XZA+ CNG",
                id: '107',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Creative + DT CNG",
                id: '108',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XZ+S CNG",
                id: '109',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Pure AMT 1.2",
                id: '110',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tigor", variant: "Tigor XZA CNG",
                id: '111',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Pure CNG",
                id: '112',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Fearless + PS DT CNG",
                id: '113',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Pure AMT 1.2",
                id: '114',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XM+S 1.2 P",
                id: '115',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Pure S AMT 1.2",
                id: '116',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "Tiago XT NRG CNG",
                id: '117',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "Tiago (P) XM",
                id: '118',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv", variant: "Curvv Pure+S 1.5",
                id: '119',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Smart + CNG",
                id: '120',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "Tiago XTA CNG",
                id: '121',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Safari 2.0", variant: "Safari Accomplished + DK (AT)",
                id: '122',
                type: ProductType.DIESEL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Tiago", variant: "Tiago (P) XE",
                id: '123',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv", variant: "Curvv Creative+S 1.2",
                id: '124',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XZ+S 1.5 D",
                id: '125',
                type: ProductType.DIESEL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Pure CNG",
                id: '126',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Smart + 1.5",
                id: '127',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XM+S CNG",
                id: '128',
                type: ProductType.CNG,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Accomplished+ AMT",
                id: '129',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv", variant: "Curvv Creative S 1.2",
                id: '130',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Punch", variant: "Punch Adventure Rhythm AMT",
                id: '131',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XZ+S LUX 1.5D",
                id: '132',
                type: ProductType.DIESEL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Altroz", variant: "Altroz XZ LUX 1.2P",
                id: '133',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Harrier", variant: "Harrier Adventure + DK",
                id: '134',
                type: ProductType.DIESEL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Curvv", variant: "Curvv Creative S 1.5",
                id: '135',
                type: ProductType.PETROL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon EV 3.0", variant: "Nexon EV 3.0 Empowered+ 45",
                id: '136',
                type: ProductType.ELECTRIC,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Nexon", variant: "Nexon Fearless DK 1.5",
                id: '137',
                type: ProductType.DIESEL,
                category: '',
                engine: '',
                transmission: ''
            },
            {
                model: "Harrier", variant: "Harrier Adventure + A (AT)",
                id: '138',
                type: ProductType.DIESEL,
                category: '',
                engine: '',
                transmission: ''
            }
        ];

        return products;
    }

    getProduct(id: string | number): Product[] {
        return this.getProducts().filter(product => product.id === id);
    }

    getproductsByType(type: ProductType): Product[] {
        return this.getProducts().filter(product => product.type === type);
    }

    createProduct(product: Product): Observable<Product> {
        return of(product);
    }

    updateProduct(id: string | number, product: Product): Observable<Product> {
        return of(product);
    }

    deleteProduct(id: string | number): Observable<void> {
        return of(undefined);
    }


}