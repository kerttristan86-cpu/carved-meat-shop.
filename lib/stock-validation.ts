import {qty} from './money';
export function requireStock(product:string,location:string,available:number,requested:number){if(requested>available)throw new Error(`${product}: ${location} has ${qty(available)} kg; this order needs ${qty(requested)} kg. Transfer received stock to this location, choose another stocked location, or reduce the quantity. No sale was saved.`);}
