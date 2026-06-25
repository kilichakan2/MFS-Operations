/**
 * lib/adapters/fake/HaccpSuppliersRepository.ts
 *
 * In-memory implementation of `HaccpSuppliersRepository`
 * (lib/ports/HaccpSuppliersRepository.ts). No Supabase SDK import — pure
 * JavaScript storage of DOMAIN types. The faithful twin of the Supabase adapter.
 *
 * TEST-INSPECTABLE (the Cluster F write surface): it records every write payload
 * AS-IS so the service tests can assert the EXACT written row (R-F-B2, a SALSA
 * compliance requirement):
 *   - `savedRecallConfigs`  — { id, payload } per saveRecallConfig call;
 *   - `updatedContacts`     — { id, payload } per updateSupplierContacts call;
 *   - `createdSuppliers`    — the CreateSupplierPersist per createSupplier call;
 *   - `updatedSuppliers`    — { id, fields } per updateSupplier call.
 *
 * Construction:
 *   - `createFakeHaccpSuppliersRepository(seed?)` factory.
 *   - `fakeHaccpSuppliersRepository` singleton — empty; barrel symmetry.
 */

import type {
  SupplierContact,
  RecallConfig,
  SaveRecallConfigPersist,
  UpdateSupplierContactsPersist,
  SupplierContactReply,
  Supplier,
  CreateSupplierPersist,
  UpdateSupplierFields,
} from "@/lib/domain";
import type { HaccpSuppliersRepository } from "@/lib/ports";

export interface FakeHaccpSuppliersSeed {
  readonly labelCode?: string | null;
  readonly activeSupplierContacts?: readonly SupplierContact[];
  readonly recallConfig?: RecallConfig | null;
  readonly recallSaveResult?: RecallConfig;
  readonly contactReply?: SupplierContactReply;
  readonly allSuppliers?: readonly Supplier[];
  readonly supplierCount?: number;
  readonly createResult?: Supplier;
  readonly updateResult?: Supplier;
}

/** A test-inspectable Fake suppliers repository: exposes recorded writes. */
export interface FakeHaccpSuppliersRepository extends HaccpSuppliersRepository {
  readonly savedRecallConfigs: readonly {
    readonly id: string | undefined;
    readonly payload: SaveRecallConfigPersist;
  }[];
  readonly updatedContacts: readonly {
    readonly id: string;
    readonly payload: UpdateSupplierContactsPersist;
  }[];
  readonly createdSuppliers: readonly CreateSupplierPersist[];
  readonly updatedSuppliers: readonly {
    readonly id: string;
    readonly fields: UpdateSupplierFields;
  }[];
}

export function createFakeHaccpSuppliersRepository(
  seed?: FakeHaccpSuppliersSeed,
): FakeHaccpSuppliersRepository {
  const savedRecallConfigs: {
    id: string | undefined;
    payload: SaveRecallConfigPersist;
  }[] = [];
  const updatedContacts: {
    id: string;
    payload: UpdateSupplierContactsPersist;
  }[] = [];
  const createdSuppliers: CreateSupplierPersist[] = [];
  const updatedSuppliers: { id: string; fields: UpdateSupplierFields }[] = [];

  return {
    get savedRecallConfigs() {
      return savedRecallConfigs;
    },
    get updatedContacts() {
      return updatedContacts;
    },
    get createdSuppliers() {
      return createdSuppliers;
    },
    get updatedSuppliers() {
      return updatedSuppliers;
    },

    async findLabelCodeByName(): Promise<string | null> {
      return seed?.labelCode ?? null;
    },

    async listActiveSupplierContacts(): Promise<readonly SupplierContact[]> {
      return seed?.activeSupplierContacts ?? [];
    },

    async getRecallConfig(): Promise<RecallConfig | null> {
      return seed?.recallConfig ?? null;
    },

    async saveRecallConfig(
      payload: SaveRecallConfigPersist,
      id: string | undefined,
    ): Promise<RecallConfig> {
      savedRecallConfigs.push({ id, payload });
      return seed?.recallSaveResult ?? ({ id: id ?? "fake-config-id" } as RecallConfig);
    },

    async updateSupplierContacts(
      id: string,
      payload: UpdateSupplierContactsPersist,
    ): Promise<SupplierContactReply> {
      updatedContacts.push({ id, payload });
      return (
        seed?.contactReply ??
        ({
          id,
          name: "",
          contact_name: payload.contact_name,
          contact_phone: payload.contact_phone,
          contact_email: payload.contact_email,
        } as SupplierContactReply)
      );
    },

    async listAllSuppliers(): Promise<readonly Supplier[]> {
      return seed?.allSuppliers ?? [];
    },

    async countSuppliers(): Promise<number> {
      return seed?.supplierCount ?? 0;
    },

    async createSupplier(payload: CreateSupplierPersist): Promise<Supplier> {
      createdSuppliers.push(payload);
      return seed?.createResult ?? ({ id: "fake-supplier-id" } as Supplier);
    },

    async updateSupplier(
      id: string,
      fields: UpdateSupplierFields,
    ): Promise<Supplier> {
      updatedSuppliers.push({ id, fields });
      return seed?.updateResult ?? ({ id } as Supplier);
    },
  };
}

export const fakeHaccpSuppliersRepository: HaccpSuppliersRepository =
  createFakeHaccpSuppliersRepository();
