import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Product } from "../../database/entities/product.entity";
import { TireSpec } from "../../database/entities/tire-spec.entity";
import { QueryProductsDto } from "./dto/query-products.dto";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

// Parses a tire size string like "205/55R16" into its three numeric parts.
function parseSize(size?: string) {
  if (!size) return null;
  const match = size.replace(/\s+/g, "").match(/^(\d{2,3})\/(\d{2,3})R?(\d{2})$/i);
  if (!match) return null;
  return { widthMm: Number(match[1]), aspectRatio: Number(match[2]), rimDiameterIn: Number(match[3]) };
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(TireSpec) private tireSpecs: Repository<TireSpec>,
  ) {}

  async findAll(query: QueryProductsDto) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);

    const qb = this.products
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.brand", "brand")
      .leftJoinAndSelect("product.category", "category")
      .leftJoinAndSelect("product.tireSpec", "tireSpec")
      .leftJoinAndSelect("product.images", "images")
      .where("product.isActive = :active", { active: true });

    if (query.type) qb.andWhere("product.condition = :condition", { condition: query.type });
    if (query.category) qb.andWhere("category.slug = :categorySlug", { categorySlug: query.category });
    if (query.brand) qb.andWhere("LOWER(brand.name) = LOWER(:brand)", { brand: query.brand });
    if (query.minPrice) qb.andWhere("product.price >= :minPrice", { minPrice: query.minPrice });
    if (query.maxPrice) qb.andWhere("product.price <= :maxPrice", { maxPrice: query.maxPrice });

    if (query.q) {
      qb.andWhere("to_tsvector('english', product.name) @@ plainto_tsquery('english', :q)", { q: query.q });
    }

    const size = parseSize(query.size);
    if (size) {
      qb.andWhere("tireSpec.widthMm = :widthMm", { widthMm: size.widthMm })
        .andWhere("tireSpec.aspectRatio = :aspectRatio", { aspectRatio: size.aspectRatio })
        .andWhere("tireSpec.rimDiameterIn = :rimDiameterIn", { rimDiameterIn: size.rimDiameterIn });
    }

    if (query.make || query.model || query.year) {
      qb.innerJoin("product.fitments", "fitment");
      if (query.make) qb.andWhere("LOWER(fitment.make) = LOWER(:make)", { make: query.make });
      if (query.model) qb.andWhere("LOWER(fitment.model) = LOWER(:model)", { model: query.model });
      if (query.year) {
        qb.andWhere(
          "(fitment.yearFrom IS NULL OR fitment.yearFrom <= :year) AND (fitment.yearTo IS NULL OR fitment.yearTo >= :year)",
          { year: query.year },
        );
      }
    }

    qb.orderBy("product.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page, limit, total } };
  }

  async findOne(id: string) {
    const product = await this.products.findOne({
      where: { id },
      relations: ["brand", "category", "tireSpec", "images", "fitments"],
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  async autocomplete(q: string) {
    if (!q || q.trim().length === 0) return { suggestions: [] };
    const rows = await this.products
      .createQueryBuilder("product")
      .select(["product.id", "product.name", "product.sku"])
      .where("product.isActive = :active", { active: true })
      .andWhere("product.name ILIKE :q", { q: `%${q}%` })
      .orderBy("product.name", "ASC")
      .limit(10)
      .getMany();
    return { suggestions: rows.map((p) => ({ id: p.id, name: p.name, sku: p.sku })) };
  }

  // ---- admin CRUD (products.write) ----

  async create(dto: CreateProductDto) {
    const product = this.products.create({
      sku: dto.sku,
      name: dto.name,
      condition: dto.condition,
      description: dto.description ?? null,
      price: dto.price,
      discountPct: dto.discountPct ?? 0,
      categoryId: dto.categoryId ?? null,
      brandId: dto.brandId ?? null,
      images: (dto.imageUrls ?? []).map((url, i) => ({ url, sortOrder: i }) as any),
      tireSpec: dto.tireSpec ? ({ ...dto.tireSpec } as any) : null,
    });
    return this.products.save(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.findOne(id);
    Object.assign(product, {
      ...(dto.sku !== undefined && { sku: dto.sku }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.condition !== undefined && { condition: dto.condition }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.discountPct !== undefined && { discountPct: dto.discountPct }),
      ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
      ...(dto.brandId !== undefined && { brandId: dto.brandId }),
    });
    if (dto.tireSpec) {
      product.tireSpec = { ...(product.tireSpec ?? {}), ...dto.tireSpec } as any;
    }
    if (dto.imageUrls) {
      product.images = dto.imageUrls.map((url, i) => ({ url, sortOrder: i }) as any);
    }
    return this.products.save(product);
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    product.isActive = false;
    await this.products.save(product);
    return { message: "Product deactivated" };
  }
}
