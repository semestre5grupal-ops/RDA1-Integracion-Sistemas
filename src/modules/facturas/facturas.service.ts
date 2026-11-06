import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { EnviarFacturaDto } from './dto/enviar-factura.dto';
import { AdminConfigService } from '../admin/admin-config.service';

/** Cabeceras y cuerpo que Gmail no acepta: rompen el mensaje o inyectan otro. */
const CR_O_LF = /[\r\n]+/g;

@Injectable()
export class FacturasService implements OnModuleDestroy {
  private readonly logger = new Logger(FacturasService.name);

  /**
   * El transporte se crea UNA vez y se reutiliza.
   *
   * `createTransport` no abre la conexion SMTP: eso ocurre en el primer
   * `sendMail`. A partir de ahi nodemailer mantiene el socket y lo recicla, que es
   * justo lo que evita el envio en modo `pool` con Gmail, porque su cuota esta
   * medida en mensajes, no en conexiones.
   */
  private transporter: Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    // Ajuste global "Envío de emails" del panel de administración
    @Optional() private readonly platformConfig?: AdminConfigService,
  ) {}

  onModuleDestroy(): void {
    this.transporter?.close();
    this.transporter = null;
  }

  /**
   * Envia la factura como adjunto a `destinatario`.
   *
   * @param destinatario Email tomado del JWT validado por `SupabaseAuthGuard`,
   *   nunca del cuerpo de la peticion.
   */
  async enviarFactura(dto: EnviarFacturaDto, destinatario: string) {
    if (this.platformConfig && !(await this.platformConfig.getValor('emailsEnabled'))) {
      this.logger.warn(`El envío de facturas por email está desactivado en la configuración.`);
      return {
        enviado: false,
        motivo: 'EMAILS_DISABLED',
        mensaje: 'El envío de correos está desactivado temporalmente.',
        pnr: dto.pnr,
        destinatario,
      };
    }
    const pdf = this.decodificarPdf(dto.pdfBase64);
    const nombreAdjunto = this.nombreArchivo(dto.pnr);

    const transporte = this.obtenerTransporte();
    if (!transporte) {
      return {
        enviado: false,
        motivo: 'SMTP_NO_CONFIGURADO',
        mensaje: 'SMTP no configurado en servidor. El comprobante se gestiona vía EmailJS y descarga directa.',
        pnr: dto.pnr,
        destinatario,
      };
    }

    try {
      const info = await transporte.sendMail({
        from: this.remitente(),
        to: this.limpiarCabecera(destinatario),
        subject: this.limpiarCabecera(`Factura ${dto.pnr} · Booking Ecuador`),
        text: this.cuerpoTexto(dto.pnr, dto.concepto),
        html: this.cuerpoHtml(dto.pnr, dto.concepto),
        attachments: [
          {
            filename: nombreAdjunto,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      });

      this.logger.log(`Factura ${dto.pnr} enviada a ${destinatario} (${info.messageId})`);

      return {
        enviado: true,
        destinatario,
        pnr: dto.pnr,
        archivo: nombreAdjunto,
        message_id: info.messageId,
      };
    } catch (error) {
      this.logger.error(
        `Fallo al enviar la factura ${dto.pnr} por SMTP: ${(error as Error).message}`,
        (error as Error).stack,
      );

      return {
        enviado: false,
        motivo: 'SMTP_SEND_FAILED',
        mensaje: 'No se pudo enviar el correo con la factura por SMTP. La reserva sigue confirmada.',
        pnr: dto.pnr,
        destinatario,
      };
    }
  }

  // ── Configuracion SMTP ─────────────────────────────────────────────────────

  /**
   * Transporte perezoso, o null si el SMTP no esta configurado.
   *
   * Se construye en la primera llamada y no en el constructor para que el modulo
   * arranque aunque falten las variables: un despliegue sin `SMTP_PASS` opera en
   * modo fallback sin provocar caídas ni errores 503 en el frontend.
   */
  private obtenerTransporte(): Transporter | null {
    if (this.transporter) return this.transporter;

    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn(
        'Faltan SMTP_HOST, SMTP_USER o SMTP_PASS en el entorno: el servicio operará en modo fallback silencioso (EmailJS / descarga directa).',
      );
      return null;
    }

    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    this.logger.log(`Configurando transporte SMTP hacia ${host}:${port}`);

    this.transporter = createTransport({
      host,
      port,
      // El puerto 587 es submission con STARTTLS. `secure: true` (465) seria
      // TLS directo y dejaria de ser correcto, asi que se deriva del puerto.
      secure: port === 465,
      auth: { user, pass },
      // Gmail cortaria la sesion TLS con su propio cert raiz en objetos
      // compartidos, que es el caso habitual en Render.
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    return this.transporter;
  }

  private remitente(): string {
    const from = this.configService.get<string>('MAIL_FROM');
    if (from) return this.limpiarCabecera(from);

    const user = this.configService.get<string>('SMTP_USER');
    return `Booking Ecuador <${user}>`;
  }

  // ── Utilidades ─────────────────────────────────────────────────────────────

  /**
   * Base64 -> `Buffer`, validando antes de decodificar.
   *
   * `Buffer.from(x, 'base64')` NO lanza ante caracteres invalidos: los descarta en
   * silencio y devuelve un buffer mas corto. Un PDF truncado se enviaria como
   * adjunto corrupto sin ninguna traza, asi que la forma se comprueba aqui y el
   * error sale como un 400 con motivo.
   */
  private decodificarPdf(base64: string): Buffer {
    // El navegador puede enviar un data URL completo; se quita el prefijo y se
    // trabaja solo con el Base64.
    const limpio = base64.replace(/^data:application\/pdf;base64,/i, '').replace(/\s+/g, '');

    if (limpio.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) {
      throw new BadRequestException(
        'pdfBase64 no contiene un Base64 valido. Vacio o corrupto.',
      );
    }

    const buffer = Buffer.from(limpio, 'base64');

    // Firma del archivo PDF. Sin esto, cualquier Base64 valido pasaria el filtro.
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new BadRequestException('El contenido de pdfBase64 no es un archivo PDF.');
    }

    return buffer;
  }

  /**
   * Nombre del adjunto con un unico conjunto de caracteres.
   *
   * El nombre viaja en la cabecera MIME `Content-Disposition`. Un PNR con `\r\n`
   * permitiria anadir cabeceras y convertir el adjunto en un vector de
   * inyeccion; se filtra a `[A-Za-z0-9_-]`, que es de donde salen los PNR reales.
   */
  private nombreArchivo(pnr: string): string {
    const seguro = pnr.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    return `Factura_${seguro || 'reserva'}.pdf`;
  }

  /**
   * Elimina CR/LF de un valor que se usa como cabecera o como campo `to`.
   *
   * Nodemailer ya rechaza la mayoria de estos casos, pero el sanitizado es
   * explicito para no depender de esa proteccion.
   */
  private limpiarCabecera(valor: string): string {
    return valor.replace(CR_O_LF, ' ').trim();
  }

  private cuerpoTexto(pnr: string, concepto?: string): string {
    const lineas = [
      'Booking Ecuador',
      '',
      `Adjuntamos la factura de su reserva ${pnr}${concepto ? ` (${concepto})` : ''}.`,
      '',
      'Conserve este correo y el archivo adjunto como comprobante de su compra.',
      '',
      'Este es un mensaje generado automaticamente, no responda a este correo.',
    ];
    return lineas.join('\n');
  }

  private cuerpoHtml(pnr: string, concepto?: string): string {
    const pnrSeguro = this.escaparHtml(pnr);
    const conceptoSeguro = concepto ? this.escaparHtml(concepto) : null;

    return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#333;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="background:#006ce4;padding:20px 24px;color:#ffffff;font-size:18px;font-weight:bold;">
          Booking Ecuador
        </td>
      </tr>
      <tr>
        <td style="padding:24px;font-size:15px;line-height:1.5;">
          <p style="margin:0 0 16px;">Hola,</p>
          <p style="margin:0 0 16px;">
            Adjuntamos la factura de su reserva
            <strong style="color:#006ce4;">${pnrSeguro}</strong>${
              conceptoSeguro ? `<br />${conceptoSeguro}` : ''
            }.
          </p>
          <p style="margin:0 0 16px;">
            Conserve este correo y el archivo adjunto como comprobante de su compra.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 24px 24px;">
          <a href="${this.enlaceMisReservas()}"
             style="display:inline-block;background:#006ce4;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:4px;font-weight:bold;font-size:14px;">
            Ver mis reservas
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
          Este es un mensaje generado automaticamente, no responda a este correo.
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  /** Base publica del frontend, para el enlace "Ver mis reservas" del correo. */
  private enlaceMisReservas(): string {
    const base = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    // Se recorta la barra final para no terminar en `//mis-reservas`.
    return `${base.replace(/\/+$/, '')}/mis-reservas`;
  }

  /** Neutraliza `<`, `>`, `&` y comillas: el PNR viene del cliente. */
  private escaparHtml(valor: string): string {
    return valor
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
