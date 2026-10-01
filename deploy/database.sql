IF OBJECT_ID(N'[together].[__EFMigrationsHistory]') IS NULL
BEGIN
    IF SCHEMA_ID(N'together') IS NULL EXEC(N'CREATE SCHEMA [together];');
    CREATE TABLE [together].[__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    IF SCHEMA_ID(N'together') IS NULL EXEC(N'CREATE SCHEMA [together];');
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[AspNetRoles] (
        [Id] nvarchar(450) NOT NULL,
        [Name] nvarchar(256) NULL,
        [NormalizedName] nvarchar(256) NULL,
        [ConcurrencyStamp] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetRoles] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[AspNetUsers] (
        [Id] nvarchar(450) NOT NULL,
        [DisplayName] nvarchar(60) NOT NULL,
        [UserName] nvarchar(256) NULL,
        [NormalizedUserName] nvarchar(256) NULL,
        [Email] nvarchar(256) NULL,
        [NormalizedEmail] nvarchar(256) NULL,
        [EmailConfirmed] bit NOT NULL,
        [PasswordHash] nvarchar(max) NULL,
        [SecurityStamp] nvarchar(max) NULL,
        [ConcurrencyStamp] nvarchar(max) NULL,
        [PhoneNumber] nvarchar(max) NULL,
        [PhoneNumberConfirmed] bit NOT NULL,
        [TwoFactorEnabled] bit NOT NULL,
        [LockoutEnd] datetimeoffset NULL,
        [LockoutEnabled] bit NOT NULL,
        [AccessFailedCount] int NOT NULL,
        CONSTRAINT [PK_AspNetUsers] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[Conversations] (
        [Id] uniqueidentifier NOT NULL,
        [Name] nvarchar(80) NOT NULL,
        [Kind] nvarchar(10) NOT NULL,
        [OwnerId] nvarchar(450) NOT NULL,
        [DirectKey] nvarchar(100) NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_Conversations] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[RetiredRooms] (
        [Name] nvarchar(80) NOT NULL,
        CONSTRAINT [PK_RetiredRooms] PRIMARY KEY ([Name])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[AspNetRoleClaims] (
        [Id] int NOT NULL IDENTITY,
        [RoleId] nvarchar(450) NOT NULL,
        [ClaimType] nvarchar(max) NULL,
        [ClaimValue] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetRoleClaims] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AspNetRoleClaims_AspNetRoles_RoleId] FOREIGN KEY ([RoleId]) REFERENCES [together].[AspNetRoles] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[AspNetUserClaims] (
        [Id] int NOT NULL IDENTITY,
        [UserId] nvarchar(450) NOT NULL,
        [ClaimType] nvarchar(max) NULL,
        [ClaimValue] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetUserClaims] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AspNetUserClaims_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [together].[AspNetUsers] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[AspNetUserLogins] (
        [LoginProvider] nvarchar(450) NOT NULL,
        [ProviderKey] nvarchar(450) NOT NULL,
        [ProviderDisplayName] nvarchar(max) NULL,
        [UserId] nvarchar(450) NOT NULL,
        CONSTRAINT [PK_AspNetUserLogins] PRIMARY KEY ([LoginProvider], [ProviderKey]),
        CONSTRAINT [FK_AspNetUserLogins_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [together].[AspNetUsers] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[AspNetUserRoles] (
        [UserId] nvarchar(450) NOT NULL,
        [RoleId] nvarchar(450) NOT NULL,
        CONSTRAINT [PK_AspNetUserRoles] PRIMARY KEY ([UserId], [RoleId]),
        CONSTRAINT [FK_AspNetUserRoles_AspNetRoles_RoleId] FOREIGN KEY ([RoleId]) REFERENCES [together].[AspNetRoles] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_AspNetUserRoles_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [together].[AspNetUsers] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[AspNetUserTokens] (
        [UserId] nvarchar(450) NOT NULL,
        [LoginProvider] nvarchar(450) NOT NULL,
        [Name] nvarchar(450) NOT NULL,
        [Value] nvarchar(max) NULL,
        CONSTRAINT [PK_AspNetUserTokens] PRIMARY KEY ([UserId], [LoginProvider], [Name]),
        CONSTRAINT [FK_AspNetUserTokens_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [together].[AspNetUsers] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[Meetings] (
        [Id] uniqueidentifier NOT NULL,
        [ConversationId] uniqueidentifier NOT NULL,
        [HostId] nvarchar(450) NOT NULL,
        [Title] nvarchar(100) NOT NULL,
        [Video] bit NOT NULL,
        [Locked] bit NOT NULL,
        [Ended] bit NOT NULL,
        [RoomName] nvarchar(80) NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_Meetings] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Meetings_Conversations_ConversationId] FOREIGN KEY ([ConversationId]) REFERENCES [together].[Conversations] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[Memberships] (
        [ConversationId] uniqueidentifier NOT NULL,
        [UserId] nvarchar(450) NOT NULL,
        [LastReadId] bigint NOT NULL,
        CONSTRAINT [PK_Memberships] PRIMARY KEY ([ConversationId], [UserId]),
        CONSTRAINT [FK_Memberships_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [together].[AspNetUsers] ([Id]),
        CONSTRAINT [FK_Memberships_Conversations_ConversationId] FOREIGN KEY ([ConversationId]) REFERENCES [together].[Conversations] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[Messages] (
        [Id] bigint NOT NULL IDENTITY,
        [ConversationId] uniqueidentifier NOT NULL,
        [SenderId] nvarchar(450) NOT NULL,
        [RequestId] uniqueidentifier NOT NULL,
        [Text] nvarchar(4000) NOT NULL,
        [SentAt] datetime2 NOT NULL,
        CONSTRAINT [PK_Messages] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Messages_AspNetUsers_SenderId] FOREIGN KEY ([SenderId]) REFERENCES [together].[AspNetUsers] ([Id]),
        CONSTRAINT [FK_Messages_Conversations_ConversationId] FOREIGN KEY ([ConversationId]) REFERENCES [together].[Conversations] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[Admissions] (
        [MeetingId] uniqueidentifier NOT NULL,
        [UserId] nvarchar(450) NOT NULL,
        [Status] nvarchar(12) NOT NULL,
        CONSTRAINT [PK_Admissions] PRIMARY KEY ([MeetingId], [UserId]),
        CONSTRAINT [FK_Admissions_AspNetUsers_UserId] FOREIGN KEY ([UserId]) REFERENCES [together].[AspNetUsers] ([Id]),
        CONSTRAINT [FK_Admissions_Meetings_MeetingId] FOREIGN KEY ([MeetingId]) REFERENCES [together].[Meetings] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE TABLE [together].[Attachments] (
        [MessageId] bigint NOT NULL,
        [Name] nvarchar(180) NOT NULL,
        [Bytes] varbinary(max) NOT NULL,
        CONSTRAINT [PK_Attachments] PRIMARY KEY ([MessageId]),
        CONSTRAINT [FK_Attachments_Messages_MessageId] FOREIGN KEY ([MessageId]) REFERENCES [together].[Messages] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'DirectKey', N'Kind', N'Name', N'OwnerId') AND [object_id] = OBJECT_ID(N'[together].[Conversations]'))
        SET IDENTITY_INSERT [together].[Conversations] ON;
    EXEC(N'INSERT INTO [together].[Conversations] ([Id], [CreatedAt], [DirectKey], [Kind], [Name], [OwnerId])
    VALUES (''10000000-0000-0000-0000-000000000001'', ''2026-10-01T00:00:00.0000000Z'', NULL, N''public'', N''Everyone'', N'''')');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'Id', N'CreatedAt', N'DirectKey', N'Kind', N'Name', N'OwnerId') AND [object_id] = OBJECT_ID(N'[together].[Conversations]'))
        SET IDENTITY_INSERT [together].[Conversations] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE INDEX [IX_Admissions_UserId] ON [together].[Admissions] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE INDEX [IX_AspNetRoleClaims_RoleId] ON [together].[AspNetRoleClaims] ([RoleId]);
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [RoleNameIndex] ON [together].[AspNetRoles] ([NormalizedName]) WHERE [NormalizedName] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE INDEX [IX_AspNetUserClaims_UserId] ON [together].[AspNetUserClaims] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE INDEX [IX_AspNetUserLogins_UserId] ON [together].[AspNetUserLogins] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE INDEX [IX_AspNetUserRoles_RoleId] ON [together].[AspNetUserRoles] ([RoleId]);
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE INDEX [EmailIndex] ON [together].[AspNetUsers] ([NormalizedEmail]);
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [UserNameIndex] ON [together].[AspNetUsers] ([NormalizedUserName]) WHERE [NormalizedUserName] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_Conversations_DirectKey] ON [together].[Conversations] ([DirectKey]) WHERE [DirectKey] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE INDEX [IX_Meetings_ConversationId] ON [together].[Meetings] ([ConversationId]);
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE INDEX [IX_Memberships_UserId] ON [together].[Memberships] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE INDEX [IX_Messages_ConversationId_Id] ON [together].[Messages] ([ConversationId], [Id]);
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Messages_SenderId_RequestId] ON [together].[Messages] ([SenderId], [RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [together].[__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261001094608_InitialChat'
)
BEGIN
    INSERT INTO [together].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261001094608_InitialChat', N'10.0.8');
END;

COMMIT;
GO

