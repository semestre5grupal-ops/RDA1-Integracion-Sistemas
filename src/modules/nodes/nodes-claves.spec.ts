import { enmascararClave, esClaveEnmascarada } from './nodes.service';

describe('Claves de socios (GET /nodes es público)', () => {
  it('nunca devuelve la clave completa, solo los 4 últimos caracteres', () => {
    expect(enmascararClave('atr_PMaHffqZE4ao_bk1bMuqzA0xXzeAbr5nZ6qOcnV7gsAu_Vh7B65zWOYM')).toBe('••••WOYM');
    expect(enmascararClave(null)).toBeNull();
    expect(enmascararClave('')).toBeNull();
  });

  it('reconoce el valor enmascarado para no guardarlo encima de la clave real', () => {
    expect(esClaveEnmascarada('••••WOYM')).toBe(true);
    expect(esClaveEnmascarada('clave-nueva-real')).toBe(false);
    expect(esClaveEnmascarada(undefined)).toBe(false);
  });
});
