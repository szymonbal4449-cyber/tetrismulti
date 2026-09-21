import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const rooms = pgTable("rooms", {
  code: text("code").primaryKey(),
  mode: text("mode").notNull(),
  maxPlayers: integer("max_players").notNull().default(4),
  status: text("status").notNull().default("lobby"),
  hostNick: text("host_nick"),
  players: integer("players").notNull().default(1),
  winner: text("winner"),
  finalScore: integer("final_score"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
