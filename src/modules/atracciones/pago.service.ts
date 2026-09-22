import { Injectable, HttpException, HttpStatus } from '@nestjs/common';


@Injectable()
export class PagoService {
  /**
   * Simula una llamada síncrona a un servicio de pagos.
   * Rechaza aleatoriamente o por ciertos datos para simular robustez.
   */
  async procesarPago(dto: { cantidadTickets: number; metodoPago?: string }): Promise<{ success: boolean; transactionId: string }> {
    // Simulamos un retraso de procesamiento (1 segundo)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Lógica básica de simulación: si la cantidad de tickets es muy alta, el pago "falla"
    if (dto.cantidadTickets > 10) {
      throw new HttpException(
        'Fondos insuficientes o límite de tickets excedido en la pasarela de pagos',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    // Retorna éxito
    return {
      success: true,
      transactionId: `TXN-${Math.floor(Math.random() * 1000000)}`,
    };
  }
}
