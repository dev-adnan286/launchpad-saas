import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Label } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLabelDto, UpdateLabelDto } from './dto/label.dto';

export interface LabelView {
  id: string;
  name: string;
  color: string;
}

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<LabelView[]> {
    const labels = await this.prisma.label.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
    return labels.map((label) => this.toView(label));
  }

  async create(organizationId: string, dto: CreateLabelDto): Promise<LabelView> {
    await this.assertNameFree(organizationId, dto.name);
    const label = await this.prisma.label.create({
      data: { organizationId, name: dto.name, ...(dto.color ? { color: dto.color } : {}) },
    });
    return this.toView(label);
  }

  async update(organizationId: string, id: string, dto: UpdateLabelDto): Promise<LabelView> {
    const existing = await this.findOrThrow(organizationId, id);
    if (dto.name && dto.name !== existing.name) await this.assertNameFree(organizationId, dto.name);
    const label = await this.prisma.label.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
    return this.toView(label);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.findOrThrow(organizationId, id);
    await this.prisma.label.delete({ where: { id } });
  }

  private async findOrThrow(organizationId: string, id: string): Promise<Label> {
    const label = await this.prisma.label.findFirst({ where: { id, organizationId } });
    if (!label) throw new NotFoundException('Label not found');
    return label;
  }

  private async assertNameFree(organizationId: string, name: string): Promise<void> {
    const clash = await this.prisma.label.findUnique({ where: { organizationId_name: { organizationId, name } } });
    if (clash) throw new ConflictException(`A label named "${name}" already exists`);
  }

  private toView(label: Label): LabelView {
    return { id: label.id, name: label.name, color: label.color };
  }
}
