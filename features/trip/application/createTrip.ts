import type { CreateTripInput } from "../domain/trip";

export interface TripRepository { create(userId: string, input: CreateTripInput, options?: { opener?: boolean }): Promise<{ id: string; name: string; destination: string | null }>; }
export async function createTrip(repository: TripRepository, userId: string, input: CreateTripInput, options?: { opener?: boolean }) { return repository.create(userId, input, options); }
