-- SQL Schema for Delight Finance (Singular Tables)
-- Dialect: SQL Server / Azure SQL

CREATE TABLE [Business] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(255) NOT NULL,
    [BusinessSettingsJson] NVARCHAR(MAX) NOT NULL DEFAULT '{}',
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [IsDefault] BIT NOT NULL DEFAULT 0,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [IsDeleted] BIT NOT NULL DEFAULT 0
);
CREATE INDEX [IX_Business_UserId] ON [Business] ([UserId]);

CREATE TABLE [Category] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Amount] DECIMAL(18, 2) NOT NULL,
    [Type] NVARCHAR(20) NOT NULL DEFAULT 'Expense',
    [GstRate] DECIMAL(18, 2) NOT NULL DEFAULT 0,
    [Month] INT NOT NULL,
    [Year] INT NOT NULL,
    [BusinessId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [FK_Category_Business_BusinessId] FOREIGN KEY ([BusinessId]) REFERENCES [Business] ([Id]) ON DELETE CASCADE
);
CREATE INDEX [IX_Category_BusinessId] ON [Category] ([BusinessId]);
CREATE INDEX [IX_Category_UserId] ON [Category] ([UserId]);

CREATE TABLE [Transaction] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Amount] DECIMAL(18, 2) NOT NULL,
    [Deductions] DECIMAL(18, 2) NOT NULL DEFAULT 0,
    [FinalAmount] DECIMAL(18, 2) NOT NULL,
    [CategoryId] UNIQUEIDENTIFIER NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    [Description] NVARCHAR(MAX) NOT NULL DEFAULT '',
    [Date] DATETIME2 NOT NULL,
    [Notes] NVARCHAR(MAX),
    [BusinessId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [FK_Transaction_Business_BusinessId] FOREIGN KEY ([BusinessId]) REFERENCES [Business] ([Id]) ON DELETE CASCADE,
    CONSTRAINT [FK_Transaction_Category_CategoryId] FOREIGN KEY ([CategoryId]) REFERENCES [Category] ([Id])
);
CREATE INDEX [IX_Transaction_BusinessId] ON [Transaction] ([BusinessId]);
CREATE INDEX [IX_Transaction_CategoryId] ON [Transaction] ([CategoryId]);
CREATE INDEX [IX_Transaction_UserId] ON [Transaction] ([UserId]);
CREATE INDEX [IX_Transaction_Date] ON [Transaction] ([Date]);

CREATE TABLE [ImportRule] (
    [Id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [Keyword] NVARCHAR(255) NOT NULL,
    [Category] NVARCHAR(100) NOT NULL,
    [BusinessId] UNIQUEIDENTIFIER NOT NULL,
    [UserId] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [FK_ImportRule_Business_BusinessId] FOREIGN KEY ([BusinessId]) REFERENCES [Business] ([Id]) ON DELETE CASCADE
);
CREATE INDEX [IX_ImportRule_BusinessId] ON [ImportRule] ([BusinessId]);
CREATE INDEX [IX_ImportRule_UserId] ON [ImportRule] ([UserId]);
