import type { CreateTripInput } from "../domain/trip";

export interface TripRepository { create(userId: string, input: CreateTripInput): Promise<{ id: string; name: string; destination: string }>; }
export async function createTrip(repository: TripRepository, userId: string, input: CreateTripInput) { return repository.create(userId, input); }
